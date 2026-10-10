import {useState} from 'react';
import {CheckCircle2,Info,RefreshCw,Search,Upload} from 'lucide-react';

type Match={event_id:string;file:string;sha256:string;source_index:number;source_filename:string;reason:string;confidence:string};
type Manifest={version:number;matches:Match[]};
type Row=Match&{title:string;date?:string;city?:string;imageUrl:string|null;result:'ready'|'existing'|'missing-event'|'missing-file'|'linked'|'failed'|'skipped';detail?:string};
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(v=>v.toString(16).padStart(2,'0')).join('');
const mime=(path:string)=>{const ext=path.split('.').pop()?.toLowerCase();return ext==='jpg'||ext==='jpeg'||ext==='jfif'?'image/jpeg':ext==='webp'?'image/webp':ext==='png'?'image/png':ext==='gif'?'image/gif':'application/octet-stream'};

async function unzipPosterPackage(file:File){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const view=new DataView(bytes.buffer);
  const u16=(i:number)=>view.getUint16(i,true),u32=(i:number)=>view.getUint32(i,true);
  const floor=Math.max(0,bytes.length-65557);let end=-1;
  for(let i=bytes.length-22;i>=floor;i--){if(u32(i)===0x06054b50){end=i;break;}}
  if(end<0)throw new Error('O ZIP não tem um diretório válido.');
  const total=u16(end+10);let p=u32(end+16);const decoder=new TextDecoder();const files=new Map<string,Blob>();
  if(total>2000)throw new Error('O ZIP tem entradas demais.');
  for(let n=0;n<total;n++){
    if(u32(p)!==0x02014b50)throw new Error('Diretório central do ZIP inválido.');
    const method=u16(p+10),packed=u32(p+20),size=u32(p+24),nl=u16(p+28),el=u16(p+30),cl=u16(p+32),local=u32(p+42);
    const name=decoder.decode(bytes.subarray(p+46,p+46+nl));p+=46+nl+el+cl;
    if(name.endsWith('/')||(name!=='poster-import-manifest.json'&&!name.startsWith('images/')))continue;
    if(size>8*1024*1024)throw new Error('Arquivo acima de 8 MB no pacote: '+name);
    if(u32(local)!==0x04034b50)throw new Error('Cabeçalho de arquivo inválido: '+name);
    const start=local+30+u16(local+26)+u16(local+28),raw=bytes.slice(start,start+packed);
    let blob:Blob;
    if(method===0)blob=new Blob([raw]);
    else if(method===8)blob=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))).blob();
    else throw new Error('Compactação ZIP não suportada em '+name);
    if(blob.size!==size)throw new Error('Tamanho incorreto para '+name);
    files.set(name,blob);
  }
  if(!files.has('poster-import-manifest.json'))throw new Error('Manifesto ausente. Selecione o pacote de reconciliação gerado para este levantamento.');
  return files;
}

export function BulkPosterImporter({db,onComplete}:{db:any;onComplete:()=>Promise<unknown>}){
  const[zip,setZip]=useState<File|null>(null),[files,setFiles]=useState<Map<string,Blob>|null>(null),[rows,setRows]=useState<Row[]>([]);
  const[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[notice,setNotice]=useState(''),[all,setAll]=useState(false);
  const ready=rows.filter(r=>r.result==='ready').length;
  const existing=rows.filter(r=>r.result==='existing').length;
  const failed=rows.filter(r=>r.result==='failed').length;

  const inspect=async()=>{
    if(!zip)return;
    setBusy(true);setNotice('');setRows([]);setFiles(null);setProgress('Lendo e verificando o ZIP…');
    try{
      const archive=await unzipPosterPackage(zip),manifest=JSON.parse(await archive.get('poster-import-manifest.json')!.text()) as Manifest;
      if(manifest.version!==1||!Array.isArray(manifest.matches)||!manifest.matches.length)throw new Error('Manifesto vazio ou versão desconhecida.');
      const paths=[...new Set(manifest.matches.map(m=>m.file))];
      for(const path of paths){
        const blob=archive.get(path);if(!blob)throw new Error('Imagem faltando no pacote: '+path);
        const match=manifest.matches.find(m=>m.file===path)!;
        if(hex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))!==match.sha256)throw new Error('A integridade da imagem não confere: '+path);
      }
      const ids=[...new Set(manifest.matches.map(m=>m.event_id))],events:any[]=[];
      for(let i=0;i<ids.length;i+=400){
        const{data,error}=await db.from('events').select('id,title,date,city,image_url').in('id',ids.slice(i,i+400));
        if(error)throw error;events.push(...(data||[]));
      }
      const byId=new Map(events.map(e=>[e.id,e])),seen=new Set<string>();
      const prepared:Row[]=manifest.matches.map(m=>{
        const e=byId.get(m.event_id);
        if(seen.has(m.event_id))return {...m,title:e?.title||m.event_id,date:e?.date,city:e?.city,imageUrl:e?.image_url||null,result:'skipped',detail:'Vínculo duplicado no manifesto.'};
        seen.add(m.event_id);
        if(!e)return {...m,title:m.event_id,imageUrl:null,result:'missing-event',detail:'Evento não encontrado no cadastro.'};
        if(String(e.image_url||'').trim())return {...m,title:e.title,date:e.date,city:e.city,imageUrl:e.image_url,result:'existing',detail:'Imagem atual será preservada.'};
        return {...m,title:e.title,date:e.date,city:e.city,imageUrl:null,result:'ready'};
      });
      setRows(prepared);setFiles(archive);
      setNotice('Conferência finalizada: '+prepared.length+' vínculos; '+prepared.filter(r=>r.result==='ready').length+' eventos prontos. O pacote será aplicado somente onde a imagem ainda está vazia.');
    }catch(e){setNotice(e instanceof Error?e.message:'Erro ao ler o pacote.');}
    finally{setBusy(false);setProgress('');}
  };

  const importAll=async()=>{
    if(!files||!ready)return;
    setBusy(true);setNotice('');
    let work=[...rows];
    try{
      const filePaths=[...new Set(work.filter(r=>r.result==='ready').map(r=>r.file))],urlByFile=new Map<string,string>(),badFiles=new Set<string>();
      for(let i=0;i<filePaths.length;i+=4){
        setProgress('Enviando imagens únicas '+Math.min(i+4,filePaths.length)+'/'+filePaths.length+'…');
        const res=await Promise.all(filePaths.slice(i,i+4).map(async path=>{
          try{
            const r=work.find(x=>x.file===path)!;const blob=files.get(path)!;const ext=(path.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
            const object='reconciled/'+r.sha256+'.'+ext;
            const{error}=await db.storage.from('event_posters').upload(object,blob,{upsert:true,contentType:mime(path)});
            if(error)throw error;
            return {path,url:db.storage.from('event_posters').getPublicUrl(object).data.publicUrl};
          }catch(e){return {path,url:null,error:e instanceof Error?e.message:'Falha no upload'};}
        }));
        for(const r of res){if(r.url)urlByFile.set(r.path,r.url);else badFiles.add(r.path);}
      }
      work=work.map(r=>r.result==='ready'&&badFiles.has(r.file)?{...r,result:'failed',detail:'Falha ao enviar imagem.'}:r);
      const tasks=work.filter(r=>r.result==='ready'&&urlByFile.has(r.file));
      for(let i=0;i<tasks.length;i+=8){
        setProgress('Associando imagens aos eventos '+Math.min(i+8,tasks.length)+'/'+tasks.length+'…');
        const res=await Promise.all(tasks.slice(i,i+8).map(async r=>{
          try{
            const url=urlByFile.get(r.file)!;let q=await db.from('events').update({image_url:url,poster_sha256:r.sha256}).eq('id',r.event_id).is('image_url',null).select('id');
            if(q.error)throw q.error;
            if(!q.data?.length){q=await db.from('events').update({image_url:url,poster_sha256:r.sha256}).eq('id',r.event_id).eq('image_url','').select('id');if(q.error)throw q.error;}
            return {id:r.event_id,result:q.data?.length?'linked' as const:'existing' as const,detail:q.data?.length?'Pôster associado.':'Outra imagem já estava associada; não foi sobrescrita.'};
          }catch(e){return {id:r.event_id,result:'failed' as const,detail:e instanceof Error?e.message:'Falha ao associar imagem.'};}
        }));
        const byId=new Map(res.map(r=>[r.id,r]));
        work=work.map(r=>{const next=byId.get(r.event_id);return r.result==='ready'&&next?{...r,result:next.result,detail:next.detail}:r;});
        setRows([...work]);
      }
      setRows(work);
      setNotice('Importação concluída: '+work.filter(r=>r.result==='linked').length+' eventos receberam pôster; '+work.filter(r=>r.result==='existing').length+' foram preservados; '+work.filter(r=>r.result==='failed').length+' falhas.');
      await onComplete();
    }catch(e){setNotice(e instanceof Error?e.message:'Falha na importação.');}
    finally{setBusy(false);setProgress('');}
  };

  const statusText=(r:Row)=>r.result==='ready'?'Pronto para importar':r.result==='existing'?'Mídia preservada':r.result==='linked'?'Importado':r.result==='failed'?'Falha':r.result==='missing-event'?'Evento ausente':'Ignorado';
  return <section className="admin-section poster-reconcile-panel">
    <div className="section-head compact"><div><div className="eyebrow">MÍDIA · RECONCILIAÇÃO</div><h2>Importar pôsteres em lote</h2><p className="page-lead">Use o pacote de reconciliação gerado a partir dos 271 arquivos. O importador só preenche eventos sem imagem e não altera os demais dados do evento.</p></div></div>
    <div className="poster-reconcile-controls"><label className="poster-reconcile-file"><Upload size={18}/><span>{zip?zip.name:'Selecionar pacote ZIP de pôsteres'}</span><input type="file" accept=".zip,application/zip" onChange={e=>{setZip(e.target.files?.[0]||null);setRows([]);setFiles(null);setNotice('');}}/></label><button type="button" className="button primary" disabled={!zip||busy} onClick={()=>void inspect()}><Search size={16}/>{busy?'Aguarde…':'Ler ZIP e conferir vínculos'}</button></div>
    {progress&&<div className="poster-reconcile-progress"><RefreshCw size={15}/>{progress}</div>}
    {notice&&<div className="callout info"><Info size={18}/><span>{notice}</span></div>}
    {rows.length>0&&<><div className="poster-reconcile-stats"><div><strong>{rows.length}</strong><span>vínculos no pacote</span></div><div><strong>{ready}</strong><span>prontos para importar</span></div><div><strong>{existing}</strong><span>com mídia preservada</span></div><div><strong>{failed}</strong><span>falhas</span></div></div><div className="poster-reconcile-preview"><div className="poster-reconcile-preview-head"><strong>Prévia dos vínculos propostos</strong><button type="button" className="button ghost" onClick={()=>setAll(v=>!v)}>{all?'Ver amostra':'Ver todos'} ({rows.length})</button></div><div className="poster-reconcile-table-wrap"><table className="poster-reconcile-table"><thead><tr><th>Evento</th><th>Imagem do arquivo</th><th>Estado</th></tr></thead><tbody>{(all?rows:rows.slice(0,8)).map(r=><tr key={r.event_id}><td><strong>{r.title}</strong><small>{[r.date,r.city].filter(Boolean).join(' · ')}</small></td><td><span>{r.source_filename}</span><small>Imagem #{r.source_index}</small></td><td><span className={'poster-reconcile-status '+r.result}>{statusText(r)}</span>{r.detail&&<small>{r.detail}</small>}</td></tr>)}</tbody></table></div></div><div className="poster-reconcile-footer"><p>O processo envia cada imagem única apenas uma vez e usa a mesma URL quando um folheto coletivo comprova vários eventos. Status, data, horário, local, notas e fontes não serão alterados.</p><button type="button" className="button primary" disabled={busy||ready===0} onClick={()=>void importAll()}><CheckCircle2 size={16}/>{busy?'Importando…':'Importar '+ready+' vínculos seguros'}</button></div></>}
  </section>;
}

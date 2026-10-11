import {useState} from 'react';
import {createCatalogOnlyManifest,unzipPosterPackage} from '../lib/posterZip.js';
import {CheckCircle2,Info,RefreshCw,Search,Upload} from 'lucide-react';

type Match={event_id:string;file:string;sha256:string;source_index:number;source_filename:string;reason:string;confidence:string};
type Poster={sha256:string;file:string;source_index:number;source_filename:string;source_indices:number[];source_filenames:string[];bytes:number;width:number|null;height:number|null;duplicate_indices:number[];is_duplicate:boolean;event_count_matched:number};
type Manifest={version:number;matches:Match[];posters:Poster[];source_images?:number;unique_files?:number;matched_events?:number;note?:string;catalog_only?:boolean};
type Row=Match&{title:string;date?:string;city?:string;imageUrl:string|null;result:'ready'|'existing'|'missing-event'|'missing-file'|'linked'|'failed'|'skipped';detail?:string};
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(v=>v.toString(16).padStart(2,'0')).join('');
const mime=(path:string)=>{const ext=path.split('.').pop()?.toLowerCase();return ext==='jpg'||ext==='jpeg'||ext==='jfif'?'image/jpeg':ext==='webp'?'image/webp':ext==='png'?'image/png':ext==='gif'?'image/gif':'application/octet-stream'};

export function BulkPosterImporter({db,onComplete}:{db:any;onComplete:()=>Promise<unknown>}){
  const[zip,setZip]=useState<File|null>(null),[files,setFiles]=useState<Map<string,Blob>|null>(null),[rows,setRows]=useState<Row[]>([]),[manifest,setManifest]=useState<Manifest|null>(null);
  const[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[notice,setNotice]=useState(''),[all,setAll]=useState(false);
  const ready=rows.filter(r=>r.result==='ready').length;
  const existing=rows.filter(r=>r.result==='existing').length;
  const failed=rows.filter(r=>r.result==='failed').length;

  const inspect=async()=>{
    if(!zip)return;
    setBusy(true);setNotice('');setRows([]);setFiles(null);setManifest(null);setProgress('Lendo e verificando o ZIP completo…');
    try{
      const archive=await unzipPosterPackage(zip);
      const manifestBlob=archive.get('poster-import-manifest.json');
      let parsed:Manifest;
      if(manifestBlob){
        parsed=JSON.parse(await manifestBlob.text()) as Manifest;
      }else{
        parsed=await createCatalogOnlyManifest(archive);
      }
      const normalizeIndexedPath=(path:string)=>{
        const normalized=path.replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/, '');
        const parts=normalized.split('/').filter(Boolean);
        const marker=parts.map(part=>part.toLowerCase()).lastIndexOf('images');
        if(marker>=0&&marker<parts.length-1)return 'images/'+parts.slice(marker+1).join('/');
        return 'images/'+(parts[parts.length-1]||normalized);
      };
      if(Array.isArray(parsed.matches))parsed.matches=parsed.matches.map(match=>({...match,file:normalizeIndexedPath(match.file)}));
      if(Array.isArray(parsed.posters))parsed.posters=parsed.posters.map(poster=>({...poster,file:normalizeIndexedPath(poster.file)}));
      if(![1,2].includes(parsed.version)||!Array.isArray(parsed.matches)||(!parsed.matches.length&&!(parsed.catalog_only&&Array.isArray(parsed.posters)&&parsed.posters.length)))throw new Error('Manifesto vazio ou versão desconhecida.');
      const posters=Array.isArray(parsed.posters)&&parsed.posters.length?parsed.posters:[...new Map(parsed.matches.map(m=>[m.sha256,{sha256:m.sha256,file:m.file,source_index:m.source_index,source_filename:m.source_filename,source_indices:[m.source_index],source_filenames:[m.source_filename],bytes:0,width:null,height:null,duplicate_indices:[m.source_index],is_duplicate:false,event_count_matched:0}])).values()];
      parsed.posters=posters;
      if(parsed.version===2&&posters.length<250&&!parsed.catalog_only)throw new Error('O índice está incompleto: esperava-se o catálogo completo dos pôsteres, mas o pacote tem apenas '+posters.length+' imagens.');
      const paths=[...new Set([...posters.map(m=>m.file),...parsed.matches.map(m=>m.file)])];
      for(let i=0;i<paths.length;i++){
        const path=paths[i],blob=archive.get(path);
        if(!blob)throw new Error('Imagem faltando no pacote: '+path);
        const poster=posters.find(m=>m.file===path);
        const match=parsed.matches.find(m=>m.file===path);
        const expected=poster?.sha256||match?.sha256;
        if(!expected||hex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))!==expected)throw new Error('A integridade da imagem não confere: '+path);
      }
      const ids=[...new Set(parsed.matches.map(m=>m.event_id))],events:any[]=[];
      for(let i=0;i<ids.length;i+=400){
        const{data,error}=await db.from('events').select('id,title,date,city,image_url').in('id',ids.slice(i,i+400));
        if(error)throw error;events.push(...(data||[]));
      }
      const byId=new Map(events.map(e=>[e.id,e])),seen=new Set<string>();
      const prepared:Row[]=parsed.matches.map(m=>{
        const e=byId.get(m.event_id);
        if(seen.has(m.event_id))return {...m,title:e?.title||m.event_id,date:e?.date,city:e?.city,imageUrl:e?.image_url||null,result:'skipped',detail:'Vínculo duplicado no manifesto.'};
        seen.add(m.event_id);
        if(!e)return {...m,title:m.event_id,imageUrl:null,result:'missing-event',detail:'Evento não encontrado no cadastro.'};
        if(String(e.image_url||'').trim())return {...m,title:e.title,date:e.date,city:e.city,imageUrl:e.image_url,result:'existing',detail:'Imagem atual será preservada.'};
        return {...m,title:e.title,date:e.date,city:e.city,imageUrl:null,result:'ready'};
      });
      setRows(prepared);setFiles(archive);setManifest(parsed);
      setNotice('Índice verificado: '+posters.length+' imagens únicas catalogáveis, '+(parsed.source_images||posters.length)+' arquivos de origem, '+prepared.length+' vínculos propostos para eventos. Imagens sem vínculo também serão enviadas ao catálogo.'+(parsed.catalog_only?' ATENÇÃO: este ZIP não contém manifesto; a operação poderá catalogar imagens, mas não associará automaticamente pôsteres a eventos.':''));
    }catch(e){setNotice(e instanceof Error?e.message:'Erro ao ler o pacote.');}
    finally{setBusy(false);setProgress('');}
  };

  const importAll=async()=>{
    if(!files||!manifest)return;
    setBusy(true);setNotice('');
    let work=[...rows];
    try{
      const posters=manifest.posters||[];
      const filePaths=[...new Set(posters.map(r=>r.file))],urlByFile=new Map<string,string>(),badFiles=new Set<string>();
      for(let i=0;i<filePaths.length;i+=4){
        setProgress('Enviando catálogo completo de pôsteres '+Math.min(i+4,filePaths.length)+'/'+filePaths.length+'…');
        const res=await Promise.all(filePaths.slice(i,i+4).map(async path=>{
          try{
            const poster=posters.find(x=>x.file===path)!;const blob=files.get(path)!;const ext=(path.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
            const object='reconciled/'+poster.sha256+'.'+ext;
            const{error}=await db.storage.from('event_posters').upload(object,blob,{upsert:true,contentType:mime(path)});
            if(error)throw error;
            return {path,url:db.storage.from('event_posters').getPublicUrl(object).data.publicUrl,object};
          }catch(e){return {path,url:null,object:null,error:e instanceof Error?e.message:'Falha no upload'};}
        }));
        for(const r of res){if(r.url)urlByFile.set(r.path,r.url);else badFiles.add(r.path);}
      }
      const catalogRows=posters.filter(p=>urlByFile.has(p.file)).map(p=>{
        const matchingEventIds=[...new Set(manifest.matches.filter(m=>m.sha256===p.sha256).map(m=>m.event_id))];
        const object='reconciled/'+p.sha256+'.'+(p.file.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
        return {sha256:p.sha256,source_filename:p.source_filename,source_filenames:p.source_filenames?.length?p.source_filenames:[p.source_filename],source_indices:p.source_indices?.length?p.source_indices:[p.source_index],storage_path:object,image_url:urlByFile.get(p.file)!,file_bytes:p.bytes||null,width:p.width||null,height:p.height||null,duplicate_count:(p.source_indices?.length||p.duplicate_indices?.length||1),matched_event_ids:matchingEventIds,indexed_at:new Date().toISOString()};
      });
      for(let i=0;i<catalogRows.length;i+=100){
        setProgress('Salvando índice pesquisável '+Math.min(i+100,catalogRows.length)+'/'+catalogRows.length+'…');
        const{error}=await db.from('poster_index').upsert(catalogRows.slice(i,i+100),{onConflict:'sha256'});
        if(error)throw new Error('As imagens foram enviadas, mas falhou ao gravar o índice: '+error.message);
      }
      work=work.map(r=>r.result==='ready'&&badFiles.has(r.file)?{...r,result:'failed',detail:'Falha ao enviar imagem.'}:r);
      const tasks=work.filter(r=>r.result==='ready'&&urlByFile.has(r.file));
      for(let i=0;i<tasks.length;i+=8){
        setProgress('Associando pôsteres aos eventos '+Math.min(i+8,tasks.length)+'/'+tasks.length+'…');
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
      const indexed=catalogRows.length;
      setNotice('Indexação concluída: '+indexed+' imagens únicas no catálogo ('+(manifest.source_images||indexed)+' arquivos de origem); '+work.filter(r=>r.result==='linked').length+' eventos receberam pôster; '+work.filter(r=>r.result==='existing').length+' eventos foram preservados; '+(posters.length-indexed)+' imagens não foram indexadas por falha de envio; '+work.filter(r=>r.result==='failed').length+' falhas de vínculo.');
      await onComplete();
    }catch(e){setNotice(e instanceof Error?e.message:'Falha na importação.');}
    finally{setBusy(false);setProgress('');}
  };

  const statusText=(r:Row)=>r.result==='ready'?'Pronto para importar':r.result==='existing'?'Mídia preservada':r.result==='linked'?'Importado':r.result==='failed'?'Falha':r.result==='missing-event'?'Evento ausente':'Ignorado';
  return <section className="admin-section poster-reconcile-panel">
    <div className="section-head compact"><div><div className="eyebrow">MÍDIA · ÍNDICE COMPLETO</div><h2>Indexar todos os pôsteres</h2><p className="page-lead">Selecione um ZIP com manifesto para conferir os vínculos sugeridos. Se o arquivo contiver apenas imagens, será possível catalogar as imagens únicas sem associá-las automaticamente a eventos. Cartazes já ligados a eventos não são sobrescritos.</p></div></div>
    <div className="poster-reconcile-controls"><label className="poster-reconcile-file"><Upload size={18}/><span>{zip?zip.name:'Selecionar ZIP do índice completo'}</span><input type="file" accept=".zip,application/zip" onChange={e=>{setZip(e.target.files?.[0]||null);setRows([]);setFiles(null);setManifest(null);setNotice('');}}/></label><button type="button" className="button primary" disabled={!zip||busy} onClick={()=>void inspect()}><Search size={16}/>{busy?'Aguarde…':'Ler ZIP e conferir índice'}</button></div>
    {progress&&<div className="poster-reconcile-progress"><RefreshCw size={15}/>{progress}</div>}
    {notice&&<div className="callout info"><Info size={18}/><span>{notice}</span></div>}
    {manifest&&<div className="poster-reconcile-stats"><div><strong>{manifest.posters.length}</strong><span>imagens únicas</span></div><div><strong>{manifest.source_images||manifest.posters.length}</strong><span>arquivos de origem</span></div><div><strong>{rows.length}</strong><span>vínculos propostos</span></div><div><strong>{ready}</strong><span>eventos prontos</span></div></div>}
    {manifest&&<>{rows.length>0&&<div className="poster-reconcile-preview"><div className="poster-reconcile-preview-head"><strong>Prévia dos vínculos propostos</strong><button type="button" className="button ghost" onClick={()=>setAll(v=>!v)}>{all?'Ver amostra':'Ver todos'} ({rows.length})</button></div><div className="poster-reconcile-table-wrap"><table className="poster-reconcile-table"><thead><tr><th>Evento</th><th>Imagem do arquivo</th><th>Estado</th></tr></thead><tbody>{(all?rows:rows.slice(0,8)).map(r=><tr key={r.event_id}><td><strong>{r.title}</strong><small>{[r.date,r.city].filter(Boolean).join(' · ')}</small></td><td><span>{r.source_filename}</span><small>Imagem #{r.source_index}</small></td><td><span className={'poster-reconcile-status '+r.result}>{statusText(r)}</span>{r.detail&&<small>{r.detail}</small>}</td></tr>)}</tbody></table></div></div>}<div className="poster-reconcile-footer"><p>{manifest.catalog_only?'Este ZIP não contém manifesto de vínculos. A ação abaixo cadastrará apenas as imagens únicas no catálogo; nenhum pôster será associado automaticamente a eventos.':'O catálogo indexa cada imagem única, registra nomes e números de origem, hashes e duplicatas, e mantém a URL pública. Só os vínculos propostos são associados automaticamente; demais cartazes permanecem pesquisáveis no catálogo. Eventos com mídia existente são preservados.'}</p><button type="button" className="button primary" disabled={busy||!manifest} onClick={()=>void importAll()}><CheckCircle2 size={16}/>{busy?'Indexando…':manifest.catalog_only?'Indexar '+manifest.posters.length+' pôsteres no catálogo (sem vincular eventos)':'Indexar '+manifest?.posters.length+' pôsteres e aplicar vínculos'}</button></div></>}
  </section>;
}

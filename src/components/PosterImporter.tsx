import {useCallback,useEffect,useState} from 'react';
import {ClipboardPaste,Image as ImageIcon,RefreshCw} from 'lucide-react';
import {extractPosterFields,type PosterExtractedFields} from '../lib/posterOcr';

type Props={
  currentImage?:string|null;
  onFileSelected:(file:File,previewUrl:string)=>void;
  onExtracted:(fields:PosterExtractedFields)=>void;
};

export default function PosterImporter({currentImage,onFileSelected,onExtracted}:Props){
  const [preview,setPreview]=useState<string|null>(null);
  const [dimensions,setDimensions]=useState('');
  const [status,setStatus]=useState('');
  const [rawText,setRawText]=useState('');
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<File|null>(null);

  const processFile=useCallback(async(file:File)=>{
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    const supported=file.type.startsWith('image/')||['jpg','jpeg','jfif','png','webp','gif'].includes(ext);
    if(!supported){setStatus('Formato não reconhecido. Use JPG/JPEG/JFIF, PNG, WEBP ou GIF.');return;}
    if(file.size>8*1024*1024){setStatus('O pôster deve ter no máximo 8 MB.');return;}
    const url=URL.createObjectURL(file);
    setPreview(url);setSelected(file);setDimensions('');setRawText('');
    onFileSelected(file,url);
    const probe=new Image();
    probe.onload=()=>setDimensions(probe.naturalWidth+' × '+probe.naturalHeight+' px');
    probe.src=url;
    setBusy(true);setStatus('Pôster anexado. Lendo o texto…');
    try{
      const result=await extractPosterFields(file);
      setRawText(result.text);
      onExtracted(result.fields);
      const detected=Object.values(result.fields).filter(Boolean).length;
      const confidence=typeof result.confidence==='number'?' · confiança OCR '+Math.round(result.confidence)+'%':'';
      setStatus('Leitura concluída: '+detected+' sugestões preenchidas'+confidence+'. Confira os campos antes de salvar.');
    }catch(error){
      setStatus(error instanceof Error?error.message:'Falha no OCR. O pôster foi anexado; preencha os campos manualmente.');
    }finally{setBusy(false);}
  },[onExtracted,onFileSelected]);

  useEffect(()=>{
    const onPaste=(event:ClipboardEvent)=>{
      const item=Array.from(event.clipboardData?.items||[]).find(entry=>entry.kind==='file'&&entry.type.startsWith('image/'));
      const file=item?.getAsFile();
      if(file){event.preventDefault();void processFile(file);}
    };
    window.addEventListener('paste',onPaste);
    return()=>window.removeEventListener('paste',onPaste);
  },[processFile]);

  const visibleImage=preview||currentImage||null;
  return <div className="poster-upload full">
    <div className="poster-upload-label"><ImageIcon size={17}/><strong>Pôster original + extração automática</strong></div>
    <p className="poster-import-help">Cole uma imagem com Ctrl+V ou selecione o arquivo. O OCR sugere os campos abaixo, mas não salva nem publica automaticamente. O arquivo original não é recortado nem convertido.</p>
    {visibleImage&&<img src={visibleImage} alt="Pré-visualização do pôster original" className="poster-preview"/>}
    {dimensions&&<small className="poster-meta">Resolução do arquivo selecionado: <strong>{dimensions}</strong></small>}
    <input type="file" accept=".jpg,.jpeg,.jfif,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif" onChange={e=>{const file=e.target.files?.[0];if(file)void processFile(file);e.currentTarget.value=''}}/>
    <div className="poster-paste-zone" tabIndex={0} onPaste={e=>{const item=Array.from(e.clipboardData.items).find(entry=>entry.kind==='file'&&entry.type.startsWith('image/'));const file=item?.getAsFile();if(file){e.preventDefault();void processFile(file)}}}><ClipboardPaste size={17}/> Clique aqui e use <strong>Ctrl+V</strong> para colar um pôster copiado.</div>
    {selected&&<button type="button" className="button ghost poster-ocr-button" disabled={busy} onClick={()=>void processFile(selected)}><RefreshCw size={15}/>{busy?'Extraindo texto…':'Ler texto novamente'}</button>}
    {status&&<small className={busy?'poster-meta':'poster-ocr-status'}>{status}</small>}
    <small>{selected?'Arquivo original selecionado.':'Nenhum pôster novo selecionado.'} Limite de 8 MB. Formatos aceitos: JPG, JPEG, JFIF, PNG, WEBP e GIF.</small>
    {rawText&&<details className="poster-ocr-result"><summary>Conferir o texto reconhecido pelo OCR</summary><pre>{rawText}</pre></details>}
  </div>;
}

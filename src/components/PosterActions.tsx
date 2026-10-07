import {Download, MessageCircle, Share2, Link2, Check} from 'lucide-react';
import {useState} from 'react';
import type {MobilizationEvent} from '../types';

type Props = { event: MobilizationEvent };

function eventText(event: MobilizationEvent) {
  const date = new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
  return `${event.title}\n📅 ${date}${event.time ? ` · ${event.time}` : ''}\n📍 ${event.city}${event.state ? ` - ${event.state}` : ''}, ${event.venue}`;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function fileName(event: MobilizationEvent) {
  return `${event.city}-${event.date}-poster.jpg`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function PosterActions({event}: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (!event.image_url) return null;

  const url = window.location.href;
  const text = eventText(event);

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 2200);
  };

  const sharePoster = async () => {
    setBusy(true);
    try {
      const response = await fetch(event.image_url!, {mode: 'cors'});
      if (!response.ok) throw new Error('Não foi possível carregar o pôster.');
      const blob = await response.blob();
      const mime = blob.type || 'image/jpeg';
      const file = new File([blob], fileName(event), {type: mime});
      if (navigator.share && navigator.canShare?.({files: [file]})) {
        await navigator.share({title: event.title, text, files: [file]});
        return;
      }
      if (navigator.share) {
        await navigator.share({title: event.title, text, url});
        showFeedback('Seu dispositivo não aceita compartilhar o arquivo; enviei o link.');
        return;
      }
      showFeedback('Seu navegador não oferece compartilhamento nativo.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showFeedback('Não foi possível compartilhar a imagem. Use “Baixar imagem”.');
    } finally {
      setBusy(false);
    }
  };

  const downloadPoster = async () => {
    setBusy(true);
    try {
      const response = await fetch(event.image_url!, {mode: 'cors'});
      if (!response.ok) throw new Error('download-failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName(event);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      showFeedback('Pôster baixado.');
    } catch {
      const anchor = document.createElement('a');
      anchor.href = event.image_url!;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      anchor.click();
      showFeedback('Abri o pôster em uma nova aba para salvar.');
    } finally {
      setBusy(false);
    }
  };

  const shareWhatsApp = () => {
    const message = `${text}\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    try {
      await copyText(url);
      showFeedback('Link copiado.');
    } catch {
      showFeedback('Não consegui copiar automaticamente.');
    }
  };

  return (
    <div className="poster-section">
      <div className="poster-heading">
        <div>
          <div className="eyebrow">PÔSTER</div>
          <h2>Compartilhe esta mobilização</h2>
        </div>
        {feedback && <span className="poster-feedback" aria-live="polite"><Check size={15}/>{feedback}</span>}
      </div>
      <figure className="poster-frame">
        <img src={event.image_url} alt={`Pôster de ${event.title}`} loading="lazy" />
      </figure>
      <div className="poster-actions" aria-label="Ações do pôster">
        <button className="button primary" onClick={sharePoster} disabled={busy}>
          <Share2 size={17}/>{busy ? 'Preparando…' : 'Compartilhar pôster'}
        </button>
        <button className="button whatsapp" onClick={shareWhatsApp}>
          <MessageCircle size={17}/>WhatsApp
        </button>
        <button className="button ghost" onClick={downloadPoster} disabled={busy}>
          <Download size={17}/>Baixar imagem
        </button>
        <button className="button ghost" onClick={copyLink}>
          <Link2 size={17}/>Copiar link
        </button>
      </div>
      <p className="poster-help">No celular, “Compartilhar pôster” tenta enviar a própria imagem para os aplicativos disponíveis. O botão WhatsApp envia o link do evento com contexto.</p>
    </div>
  );
}

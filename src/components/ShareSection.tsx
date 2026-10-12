import {useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {Check, Copy, Download, Image as ImageIcon, Megaphone, Share2, X} from 'lucide-react';
import {BANNER_PATH} from '../config/site';
import type {MobilizationEvent} from '../types';
import {downloadBlob} from '../utils/shareCardGenerator';
import {SOCIAL_NETWORKS, SHARE_SHORT_URL, buildAgendaShareText, buildShareLink, type ShareContent} from '../utils/socialShare';

const SHARE_TITLE = 'Agenda de Mobilizações pelo Lula';
const BANNER_FILE_NAME = 'agenda-mobilizações.png';

async function fetchBanner(): Promise<Blob> {
  const response = await fetch(BANNER_PATH);
  if (!response.ok) throw new Error('Banner indisponível.');
  return response.blob();
}

async function copyToClipboard(value: string): Promise<void> {
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

export default function ShareSection({events}: {events: MobilizationEvent[]}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const content = useMemo<ShareContent>(() => ({
    text: buildAgendaShareText(),
    url: SHARE_SHORT_URL,
    hashtags: [],
  }), []);

  const caption = content.text;

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(''), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const openFallback = () => dialogRef.current?.showModal();
  const closeFallback = () => dialogRef.current?.close();

  const share = async () => {
    // Dispara a cópia imediatamente no clique e continua mesmo se o navegador negar a permissão.
    const copyTask = copyToClipboard(caption)
      .then(() => setFeedback('Texto pronto copiado. Você também pode anexar o banner ao publicar.'))
      .catch(() => setFeedback('Não foi possível copiar automaticamente; a legenda continua disponível abaixo.'));

    if (typeof navigator.share !== 'function') {
      await copyTask;
      openFallback();
      return;
    }

    setBusy(true);
    try {
      const blob = await fetchBanner();
      const file = new File([blob], BANNER_FILE_NAME, {type: blob.type || 'image/png'});
      if (navigator.canShare?.({files: [file]})) {
        await navigator.share({title: SHARE_TITLE, text: caption, files: [file]});
      } else {
        await navigator.share({title: SHARE_TITLE, text: caption});
      }
      await copyTask;
    } catch (error) {
      await copyTask;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      openFallback();
    } finally {
      setBusy(false);
    }
  };

  const downloadBanner = async () => {
    try {
      downloadBlob(await fetchBanner(), BANNER_FILE_NAME);
      setFeedback('Banner baixado. Agora é só postar no Instagram.');
    } catch {
      setFeedback('Não foi possível baixar o banner.');
    }
  };

  const copyCaption = async () => {
    try {
      await copyToClipboard(caption);
      setFeedback('Texto pronto copiado.');
    } catch {
      setFeedback('Não foi possível copiar a legenda.');
    }
  };

  return (
    <section className="share-section share-section-compact" aria-labelledby="share-section-title">
      <div className="container share-cta share-cta-compact">
        <div className="share-note-copy">
          <Megaphone size={17} aria-hidden="true" />
          <p id="share-section-title">Ajude mais pessoas a conhecerem a Agenda de Mobilizações</p>
        </div>
        <div className="share-cta-actions">
          <button type="button" className="button ghost share-cta-main" onClick={share} disabled={busy}>
            <Share2 size={16} aria-hidden="true" />
            {busy ? 'Preparando…' : 'Compartilhar agenda'}
          </button>
          <Link to="/divulgar" className="share-section-link">
            <ImageIcon size={15} aria-hidden="true" /> Criar painel
          </Link>
        </div>
        <p className="share-cta-feedback" aria-live="polite">
          {feedback && <><Check size={14} aria-hidden="true" /> {feedback}</>}
        </p>
      </div>

      <dialog ref={dialogRef} className="share-dialog" aria-labelledby="share-dialog-title">
        <div className="share-dialog-head">
          <h3 id="share-dialog-title">Compartilhar a agenda</h3>
          <button type="button" className="share-dialog-close" onClick={closeFallback} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="share-dialog-body">
          <div className="share-social share-social-grid" role="group" aria-label="Compartilhar nas redes">
            {SOCIAL_NETWORKS.map(network => (
              <a
                key={network.id}
                className={`share-social-link share-social-${network.id}`}
                href={buildShareLink(network.id, content)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {network.label}
              </a>
            ))}
          </div>
          <div className="share-instagram">
            <strong>Instagram</strong>
            <p>
              O Instagram não aceita link direto no computador: baixe o banner, copie a legenda e publique pelo
              aplicativo ou pelo site.
            </p>
            <div className="share-card-buttons">
              <button type="button" className="button primary" onClick={downloadBanner}>
                <Download size={17} aria-hidden="true" /> Baixar banner
              </button>
              <button type="button" className="button ghost" onClick={copyCaption}>
                <Copy size={17} aria-hidden="true" /> Copiar legenda
              </button>
            </div>
          </div>
          <p className="share-cta-feedback" aria-live="polite">
            {feedback && (
              <>
                <Check size={14} aria-hidden="true" /> {feedback}
              </>
            )}
          </p>
        </div>
      </dialog>
    </section>
  );
}

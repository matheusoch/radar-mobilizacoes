import {useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {Check, Copy, Download, Image as ImageIcon, Megaphone, Share2, X} from 'lucide-react';
import {BANNER_PATH, resolveSiteUrl} from '../config/site';
import type {MobilizationEvent} from '../types';
import {downloadBlob} from '../utils/shareCardGenerator';
import {SOCIAL_NETWORKS, buildShareLink, type ShareContent} from '../utils/socialShare';

const SHARE_TITLE = 'Agenda de Mobilizações pelo Lula';
const BANNER_FILE_NAME = 'agenda-mobilizacoes.png';
const HASHTAGS = ['AgendaDeMobilizacoes'] as const;

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

  const content = useMemo<ShareContent>(() => {
    const url = resolveSiteUrl();
    const total = events.filter(event => event.public).length;
    const text = total
      ? `Agenda de Mobilizações pelo Lula: ${total} ${total === 1 ? 'ato' : 'atos'} organizados pelo Brasil. Acesse a agenda e ajude a ocupar as ruas.`
      : 'Agenda de Mobilizações pelo Lula: acesse a agenda e ajude a ocupar as ruas.';
    return {text, url, hashtags: HASHTAGS};
  }, [events]);

  const caption = useMemo(
    () => `${content.text}\n\n${content.url}\n\n${HASHTAGS.map(tag => `#${tag}`).join(' ')}`,
    [content],
  );

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(''), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const openFallback = () => dialogRef.current?.showModal();
  const closeFallback = () => dialogRef.current?.close();

  const share = async () => {
    if (typeof navigator.share !== 'function') {
      openFallback();
      return;
    }
    setBusy(true);
    try {
      const blob = await fetchBanner();
      const file = new File([blob], BANNER_FILE_NAME, {type: blob.type || 'image/png'});
      if (navigator.canShare?.({files: [file]})) {
        await navigator.share({title: SHARE_TITLE, text: `${content.text}\n\n${content.url}`, files: [file]});
      } else {
        await navigator.share({title: SHARE_TITLE, text: content.text, url: content.url});
      }
    } catch (error) {
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
      setFeedback('Legenda copiada. Cole na publicação do Instagram.');
    } catch {
      setFeedback('Não foi possível copiar a legenda.');
    }
  };

  return (
    <section className="share-section" aria-labelledby="share-section-title">
      <div className="container share-cta">
        <div className="eyebrow">
          <Megaphone size={14} aria-hidden="true" /> DIVULGAR
        </div>
        <h2 id="share-section-title">Ocupe as redes. Ocupe as ruas.</h2>
        <p>
          Cada compartilhamento coloca mais gente na rua. Envie a agenda para seus grupos e convoque quem está perto de
          você.
        </p>
        <div className="share-cta-actions">
          <button type="button" className="button primary share-cta-main" onClick={share} disabled={busy}>
            <Share2 size={18} aria-hidden="true" />
            {busy ? 'Preparando…' : 'Compartilhar'}
          </button>
          <Link to="/divulgar" className="share-section-link">
            <ImageIcon size={16} aria-hidden="true" /> Montar painel com eventos escolhidos
          </Link>
        </div>
        <p className="share-cta-feedback" aria-live="polite">
          {feedback && (
            <>
              <Check size={14} aria-hidden="true" /> {feedback}
            </>
          )}
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

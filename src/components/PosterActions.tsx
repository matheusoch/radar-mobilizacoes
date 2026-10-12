import {Download, FileCode2, Share2, Link2, Check} from 'lucide-react';
import {useMemo, useState} from 'react';
import {resolveSiteUrl} from '../config/site';
import type {MobilizationEvent} from '../types';
import {
  downloadBlob,
  generateShareCard,
  svgToBlob,
  svgToDataUrl,
  svgToPngBlob,
} from '../utils/shareCardGenerator';
import {useShareCardAssets} from '../utils/useShareCardAssets';
import {SOCIAL_NETWORKS, buildShareLink, describeEventForShare, type ShareContent} from '../utils/socialShare';

type Props = {event: MobilizationEvent};

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

function fileBase(event: MobilizationEvent) {
  return `${event.city}-${event.date}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function PosterActions({event}: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const assets = useShareCardAssets();

  const card = useMemo(() => (assets ? generateShareCard([event], {format: 'feed', assets}) : null), [event, assets]);
  const hasPoster = Boolean(event.image_url);
  const base = fileBase(event);

  const content = useMemo<ShareContent>(
    () => ({
      text: describeEventForShare(event),
      url: `${resolveSiteUrl()}/evento/${encodeURIComponent(event.id)}`,
      hashtags: ['AgendaDeMobilizacoes'],
    }),
    [event],
  );

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 2600);
  };

  const fetchPoster = async (): Promise<Blob> => {
    const response = await fetch(event.image_url!, {mode: 'cors'});
    if (!response.ok) throw new Error('Não foi possível carregar o pôster.');
    return response.blob();
  };

  const buildCardPng = async (): Promise<Blob> => {
    if (!card) throw new Error('Card indisponível.');
    return svgToPngBlob(card.svg, card.width, card.height);
  };

  const sharePoster = async () => {
    setBusy(true);
    try {
      let blob: Blob;
      let name: string;
      if (hasPoster) {
        try {
          blob = await fetchPoster();
          name = `${base}-poster.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
        } catch {
          blob = await buildCardPng();
          name = `${base}-card.png`;
        }
      } else {
        blob = await buildCardPng();
        name = `${base}-card.png`;
      }
      const file = new File([blob], name, {type: blob.type || 'image/png'});
      if (navigator.share && navigator.canShare?.({files: [file]})) {
        await navigator.share({title: event.title, text: content.text, files: [file]});
        return;
      }
      if (navigator.share) {
        await navigator.share({title: event.title, text: content.text, url: content.url});
        showFeedback('Seu dispositivo não aceita compartilhar o arquivo; enviei o link.');
        return;
      }
      showFeedback('Seu navegador não oferece compartilhamento nativo.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showFeedback('Não foi possível compartilhar a imagem. Use “Baixar card”.');
    } finally {
      setBusy(false);
    }
  };

  const downloadPoster = async () => {
    setBusy(true);
    try {
      const blob = await fetchPoster();
      downloadBlob(blob, `${base}-poster.${blob.type === 'image/png' ? 'png' : 'jpg'}`);
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

  const downloadCardPng = async () => {
    setBusy(true);
    try {
      downloadBlob(await buildCardPng(), `${base}-card.png`);
      showFeedback('Card PNG baixado.');
    } catch {
      showFeedback('Não foi possível gerar o PNG. Tente o SVG.');
    } finally {
      setBusy(false);
    }
  };

  const downloadCardSvg = () => {
    if (!card) return;
    downloadBlob(svgToBlob(card.svg), `${base}-card.svg`);
    showFeedback('Card SVG baixado.');
  };

  const copyLink = async () => {
    try {
      await copyText(content.url);
      showFeedback('Link copiado.');
    } catch {
      showFeedback('Não consegui copiar automaticamente.');
    }
  };

  return (
    <div className="poster-section">
      <div className="poster-heading">
        <div>
          <div className="eyebrow">{hasPoster ? 'PÔSTER' : 'CARD DE DIVULGAÇÃO'}</div>
          <h2>Compartilhe esta mobilização</h2>
        </div>
        {feedback && (
          <span className="poster-feedback" aria-live="polite">
            <Check size={15} />
            {feedback}
          </span>
        )}
      </div>
      <figure className="poster-frame">
        {hasPoster ? (
          <img src={event.image_url!} alt={`Pôster de ${event.title}`} loading="lazy" />
        ) : card ? (
          <img
            src={svgToDataUrl(card.svg)}
            width={card.width}
            height={card.height}
            alt={`Card de divulgação de ${event.title}`}
          />
        ) : null}
      </figure>
      <div className="poster-actions" aria-label="Ações do pôster">
        <button className="button primary" onClick={sharePoster} disabled={busy}>
          <Share2 size={17} />
          {busy ? 'Preparando…' : hasPoster ? 'Compartilhar pôster' : 'Compartilhar card'}
        </button>
        {hasPoster && (
          <button className="button ghost" onClick={downloadPoster} disabled={busy}>
            <Download size={17} />
            Baixar pôster
          </button>
        )}
        <button className="button ghost" onClick={downloadCardPng} disabled={busy}>
          <Download size={17} />
          Baixar card
        </button>
        <button className="button ghost" onClick={downloadCardSvg}>
          <FileCode2 size={17} />
          Card SVG
        </button>
        <button className="button ghost" onClick={copyLink}>
          <Link2 size={17} />
          Copiar link
        </button>
      </div>
      <div className="share-social" role="group" aria-label="Compartilhar nas redes">
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
      <p className="poster-help">
        No celular, “Compartilhar” tenta enviar a própria imagem para os aplicativos disponíveis. Os botões das redes
        publicam o link do evento com contexto.
      </p>
    </div>
  );
}

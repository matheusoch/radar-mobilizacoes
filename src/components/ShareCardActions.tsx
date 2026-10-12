import {useRef, useState} from 'react';
import {Check, Download, FileCode2, Link2, Share2} from 'lucide-react';
import type {ShareCardResult} from '../utils/shareCardGenerator';
import {downloadBlob, svgToBlob, svgToPngBlob} from '../utils/shareCardGenerator';
import {SOCIAL_NETWORKS, buildShareLink, type ShareContent} from '../utils/socialShare';

interface Props {
  card: ShareCardResult | null;
  fileBase: string;
  content: ShareContent;
  shareTitle: string;
  className?: string;
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

export default function ShareCardActions({card, fileBase, content, shareTitle, className}: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const notify = (message: string) => {
    setFeedback(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFeedback(''), 2800);
  };

  const pageName = (index: number, extension: string): string =>
    card && card.pages.length > 1 ? `${fileBase}-${index + 1}.${extension}` : `${fileBase}.${extension}`;

  const buildPngs = async (): Promise<File[]> => {
    if (!card) throw new Error('Card indisponível.');
    return Promise.all(
      card.pages.map(async page => {
        const blob = await svgToPngBlob(page.svg, page.width, page.height);
        return new File([blob], pageName(page.index, 'png'), {type: 'image/png'});
      }),
    );
  };

  const downloadPng = async () => {
    setBusy(true);
    try {
      const files = await buildPngs();
      files.forEach((file, index) => window.setTimeout(() => downloadBlob(file, file.name), index * 350));
      notify(files.length > 1 ? `${files.length} imagens PNG baixadas.` : 'Imagem PNG baixada.');
    } catch {
      notify('Não foi possível gerar o PNG. Tente baixar o SVG.');
    } finally {
      setBusy(false);
    }
  };

  const downloadSvg = () => {
    if (!card) return;
    card.pages.forEach((page, index) =>
      window.setTimeout(() => downloadBlob(svgToBlob(page.svg), pageName(page.index, 'svg')), index * 350),
    );
    notify(card.pages.length > 1 ? 'Arquivos SVG baixados.' : 'Arquivo SVG baixado.');
  };

  const copyLink = async () => {
    try {
      await copyToClipboard(content.url);
      notify('Link copiado.');
    } catch {
      notify('Não foi possível copiar automaticamente.');
    }
  };

  const nativeShare = async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    setBusy(true);
    try {
      const files = await buildPngs();
      if (navigator.canShare?.({files})) {
        await navigator.share({title: shareTitle, text: content.text, files});
      } else {
        await navigator.share({title: shareTitle, text: content.text, url: content.url});
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify('Não foi possível compartilhar. Use os botões das redes ou baixe a imagem.');
    } finally {
      setBusy(false);
    }
  };

  const disabled = !card || busy;

  return (
    <div className={className ? `share-card-actions ${className}` : 'share-card-actions'}>
      <div className="share-card-buttons">
        <button type="button" className="button primary" onClick={downloadPng} disabled={disabled}>
          <Download size={17} />
          {busy ? 'Preparando…' : 'Baixar PNG'}
        </button>
        <button type="button" className="button ghost" onClick={downloadSvg} disabled={!card}>
          <FileCode2 size={17} />
          Baixar SVG
        </button>
        <button type="button" className="button ghost" onClick={nativeShare} disabled={disabled}>
          <Share2 size={17} />
          Compartilhar
        </button>
        <button type="button" className="button ghost" onClick={copyLink} disabled={!card}>
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
      <p className="share-card-feedback" aria-live="polite">
        {feedback && (
          <>
            <Check size={14} />
            {feedback}
          </>
        )}
      </p>
    </div>
  );
}

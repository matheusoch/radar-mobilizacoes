import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {Image as ImageIcon, Megaphone} from 'lucide-react';
import {IMAGE_FORMATS, IMAGE_FORMAT_KEYS, resolveSiteUrl, type ImageFormatKey} from '../config/site';
import type {MobilizationEvent} from '../types';
import {generateShareCard, loadBebasNeueDataUrl, svgToDataUrl} from '../utils/shareCardGenerator';
import {buildEventsShareText, type ShareContent} from '../utils/socialShare';
import ShareCardActions from './ShareCardActions';

const PREVIEW_EVENT_LIMIT = 5;
const HASHTAGS = ['AgendaDeMobilizacoes'] as const;

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function ShareSection({events}: {events: MobilizationEvent[]}) {
  const [format, setFormat] = useState<ImageFormatKey>('feed');
  const [fontDataUrl, setFontDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadBebasNeueDataUrl().then(url => {
      if (active) setFontDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);

  const upcoming = useMemo(() => {
    const today = todayKey();
    return events
      .filter(event => event.public && event.date >= today)
      .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))
      .slice(0, PREVIEW_EVENT_LIMIT);
  }, [events]);

  const card = useMemo(
    () => (upcoming.length ? generateShareCard(upcoming, {format, fontDataUrl}) : null),
    [upcoming, format, fontDataUrl],
  );

  const content = useMemo<ShareContent>(() => {
    const base = resolveSiteUrl();
    const ids = upcoming.map(event => encodeURIComponent(event.id)).join(',');
    return {
      text: buildEventsShareText(upcoming),
      url: ids ? `${base}/divulgar?eventos=${ids}` : `${base}/divulgar`,
      hashtags: HASHTAGS,
    };
  }, [upcoming]);

  if (!upcoming.length) return null;

  const current = IMAGE_FORMATS[format];

  return (
    <section className="share-section" aria-labelledby="share-section-title">
      <div className="container share-section-grid">
        <div className="share-section-copy">
          <div className="eyebrow">
            <Megaphone size={14} aria-hidden="true" /> DIVULGAR
          </div>
          <h2 id="share-section-title">Leve a agenda para as suas redes.</h2>
          <p>
            Um card pronto com os próximos eventos, em vetor, nos formatos de feed, story e pré-visualização de link.
            Baixe a imagem ou publique direto no WhatsApp, Telegram, X, Threads, Bluesky e Facebook.
          </p>

          <div className="share-format-tabs" role="radiogroup" aria-label="Formato da imagem">
            {IMAGE_FORMAT_KEYS.map(key => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={format === key}
                className={format === key ? 'share-format-tab active' : 'share-format-tab'}
                onClick={() => setFormat(key)}
              >
                <strong>{IMAGE_FORMATS[key].label}</strong>
                <small>
                  {IMAGE_FORMATS[key].width}×{IMAGE_FORMATS[key].height}
                </small>
              </button>
            ))}
          </div>

          <ShareCardActions
            card={card}
            fileBase={`agenda-mobilizacoes-${format}`}
            content={content}
            shareTitle="Agenda de Mobilizações"
          />

          <Link to="/divulgar" className="share-section-link">
            <ImageIcon size={16} /> Montar meu próprio painel com eventos escolhidos
          </Link>
        </div>

        <figure className={`share-section-preview share-section-preview-${format}`}>
          {card && (
            <img
              src={svgToDataUrl(card.svg)}
              width={current.width}
              height={current.height}
              alt={`Prévia do card de divulgação com ${card.shownEvents} ${card.shownEvents === 1 ? 'evento' : 'eventos'} (${current.label})`}
            />
          )}
        </figure>
      </div>
    </section>
  );
}

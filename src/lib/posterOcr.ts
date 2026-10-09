export type PosterExtractedFields = {
  title?: string;
  type?: string;
  date?: string;
  time?: string;
  time_label?: string;
  city?: string;
  state?: string;
  venue?: string;
  address?: string;
};

type OcrWorker = {
  recognize: (image: File) => Promise<{ data: { text: string; confidence?: number } }>;
  terminate: () => Promise<void>;
};
type TesseractApi = { createWorker: (languages: string, oem?: number) => Promise<OcrWorker> };

declare global {
  interface Window { Tesseract?: TesseractApi; }
}

let tesseractPromise: Promise<TesseractApi> | null = null;

function loadTesseract(): Promise<TesseractApi> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-poster-ocr]');
      const script = existing || document.createElement('script');
      const fail = () => { tesseractPromise = null; reject(new Error('Não foi possível carregar o OCR. Confira a conexão e tente novamente.')); };
      script.addEventListener('error', fail, { once: true });
      script.addEventListener('load', () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else fail();
      }, { once: true });
      if (!existing) {
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.async = true;
        script.dataset.posterOcr = 'true';
        document.head.appendChild(script);
      } else if (window.Tesseract) resolve(window.Tesseract);
    });
  }
  return tesseractPromise;
}

const states = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
const knownCities: Record<string,string> = {
  'belo horizonte':'MG','sao paulo':'SP','rio de janeiro':'RJ','duque de caxias':'RJ','nova iguacu':'RJ','niteroi':'RJ','sao goncalo':'RJ','campinas':'SP','sao jose dos campos':'SP','santos':'SP','brasilia':'DF','goiania':'GO','cuiaba':'MT','campo grande':'MS','palmas':'TO','belem':'PA','braganca':'PA','manaus':'AM','fortaleza':'CE','caucaia':'CE','salvador':'BA','feira de santana':'BA','recife':'PE','serra talhada':'PE','natal':'RN','teresina':'PI','sao luis':'MA','macapa':'AP','curitiba':'PR','maringa':'PR','ponta grossa':'PR','florianopolis':'SC','balneario camboriu':'SC','porto alegre':'RS','rio grande':'RS','vitoria':'ES','sao mateus':'ES','ouro preto':'MG','uberlandia':'MG','sao joao del rei':'MG','arapiraca':'AL','boa vista':'RR','blumenau':'SC','seropedica':'RJ','tres rios':'RJ'
};
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const clean = (s: string) => s.replace(/[•●▪■]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:|–—-]+|[\s|]+$/g, '').trim();

function inferType(text: string): string | undefined {
  const t = normalize(text);
  if (/caminhada|passeata/.test(t)) return 'Caminhada';
  if (/panfletagem|bandeiracao|distribuicao de panfletos/.test(t)) return 'Panfletagem';
  if (/plenaria/.test(t)) return 'Plenária';
  if (/assembleia/.test(t)) return 'Assembleia';
  if (/oficina|colagem de lambes/.test(t)) return 'Oficina';
  if (/debate|roda de conversa/.test(t)) return 'Debate';
  if (/reuniao|reunião/.test(t)) return 'Reunião';
  if (/ato publico|ato político|ato politico/.test(t)) return 'Ato';
  if (/manifestacao|manifestação|protesto/.test(t)) return 'Manifestação';
  if (/universidade|universitario|universitária|estudantes|campus|uf[a-z]{2}/.test(t)) return 'Atividade universitária';
  if (/samba|show|cultural/.test(t)) return 'Atividade cultural/política';
  return /mobilizacao|mobilização/.test(t) ? 'Mobilização' : undefined;
}

function extractDate(lines: string[]): string | undefined {
  const candidates = lines.join('\n').match(/\b(\d{1,2})[/. -](\d{1,2})(?:[/. -](20\d{2}))?\b/g) || [];
  const now = new Date();
  for (const candidate of candidates) {
    const m = candidate.match(/^(\d{1,2})[/. -](\d{1,2})(?:[/. -](20\d{2}))?$/);
    if (!m) continue;
    const day = Number(m[1]), month = Number(m[2]);
    const year = Number(m[3] || now.getFullYear());
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return [year, String(month).padStart(2,'0'), String(day).padStart(2,'0')].join('-');
    }
  }
  const monthNames: Record<string,number> = {janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  for (const line of lines) {
    const n = normalize(line);
    const m = n.match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(20\d{2}))?/);
    if (m) return [Number(m[3] || now.getFullYear()),String(monthNames[m[2]]).padStart(2,'0'),String(Number(m[1])).padStart(2,'0')].join('-');
  }
  return undefined;
}

function extractTimes(lines: string[]): { time?: string; label?: string } {
  const scheduleLines = lines.filter(line => /\b(?:\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/i.test(line) && !/\d{1,2}[/.]\d{1,2}/.test(line));
  const all = scheduleLines.join(' · ');
  const explicit: Array<{ match: string; index: number; h:number; m:number }> = [];
  const re = /\b([01]?\d|2[0-3])\s*(?:h\s*([0-5]\d)?|:([0-5]\d))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(all))) explicit.push({match:m[0],index:m.index,h:Number(m[1]),m:Number(m[2] || m[3] || 0)});
  if (!explicit.length) return {};
  const first = explicit[0];
  const time = String(first.h).padStart(2,'0')+':'+String(first.m).padStart(2,'0');
  const label = scheduleLines.length ? clean(scheduleLines.join(' / ')) : first.match;
  return {time, label: label.length > 180 ? label.slice(0,177)+'…' : label};
}

function extractLocation(lines: string[]): { city?: string; state?: string; venue?: string; address?: string } {
  let city: string | undefined, state: string | undefined;
  const full = lines.join('\n');
  const explicit = full.match(/(?:cidade|localidade)\s*[:\-]\s*([^\n,|]+)(?:[,/\-]\s*([A-Z]{2})\b)?/i);
  if (explicit) {
    city = clean(explicit[1]);
    const candidateState = (explicit[2] || '').toUpperCase();
    if (states.has(candidateState)) state = candidateState;
  }
  for (const line of lines) {
    const m = line.match(/(?:^|[|,;])\s*([^|,;\n]{2,45}?)\s*[-/·]\s*([A-Z]{2})\b/);
    if (!state && m && states.has(m[2].toUpperCase())) { city = clean(m[1]); state = m[2].toUpperCase(); }
  }
  if (city) {
    const uf=knownCities[normalize(city)];
    if (!state && uf) state=uf;
  }
  if (!city) {
    for (const line of lines) {
      const n = normalize(line);
      for (const [name, uf] of Object.entries(knownCities)) {
        if (n.includes(name)) { city = name.replace(/\b\w/g, c=>c.toUpperCase()).replace('Sao ','São ').replace('Belo horizonte','Belo Horizonte').replace('Rio de janeiro','Rio de Janeiro').replace('Duque de caxias','Duque de Caxias').replace('Nova iguacu','Nova Iguaçu').replace('Sao paulo','São Paulo').replace('Sao luis','São Luís').replace('Sao goncalo','São Gonçalo').replace('Feira de santana','Feira de Santana').replace('Campo grande','Campo Grande').replace('Campo mourao','Campo Mourão').replace('Ouro preto','Ouro Preto').replace('Ponta grossa','Ponta Grossa').replace('Balneario camboriu','Balneário Camboriú').replace('Sao jose dos campos','São José dos Campos').replace('Sao joao del rei','São João del-Rei').replace('Rio grande','Rio Grande').replace('Sao mateus','São Mateus'); state=uf; break; }
      }
      if(city) break;
    }
  }
  const addressLine = lines.find(line => /\b(endereco|endereço|rua|avenida|av\.|travessa|alameda|rodovia|numero)\b/i.test(line));
  const venueLine = lines.find(line => /\b(praca|praça|largo|campus|uf[a-z]{2}|masp|estacao|estação|terminal|sindicato|audit[oó]rio|teatro|reitoria|rodoviaria|rodoviária|concentracao|concentração|esquina|centro)\b/i.test(line));
  return {city, state, address: addressLine ? clean(addressLine) : undefined, venue: venueLine ? clean(venueLine) : addressLine ? clean(addressLine) : undefined};
}

export async function extractPosterFields(file: File): Promise<{ text: string; confidence?: number; fields: PosterExtractedFields }> {
  const tesseract = await loadTesseract();
  const worker = await tesseract.createWorker('por+eng');
  try {
    const result = await worker.recognize(file);
    const text = result.data.text || '';
    const lines = text.split(/\r?\n/).map(clean).filter(line=>line.length>1);
    const joined = lines.join(' ');
    const excluded = /\b(\d{1,2}[/.]\d{1,2}|\d{1,2}\s*h|\d{1,2}:\d{2}|presencial|online|instagram|facebook|twitter|\bhttps?:|www\.)/i;
    const titleCandidate = lines.find(line => line.length >= 5 && line.length <= 95 && !excluded.test(line) && !/^(local|endereco|endereço|data|horario|horário|hora|cidade|entrada|saida|saída)\b/i.test(line));
    const loc = extractLocation(lines);
    const schedule = extractTimes(lines);
    const fields: PosterExtractedFields = {
      title: titleCandidate ? clean(titleCandidate) : undefined,
      type: inferType(joined),
      date: extractDate(lines),
      time: schedule.time,
      time_label: schedule.label,
      city: loc.city,
      state: loc.state,
      venue: loc.venue,
      address: loc.address,
    };
    return {text, confidence: result.data.confidence, fields};
  } finally {
    await worker.terminate();
  }
}

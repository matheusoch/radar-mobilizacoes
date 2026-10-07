import type { CSSProperties } from 'react';

const stateNames: Record<string, string> = {
  AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará',
  DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão', MT:'Mato Grosso',
  MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará', PB:'Paraíba', PR:'Paraná', PE:'Pernambuco',
  PI:'Piauí', RJ:'Rio de Janeiro', RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia',
  RR:'Roraima', SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins',
};

const validUF = new Set(Object.keys(stateNames));

export function normalizeUF(value?: string | null) {
  const uf = (value || '').trim().toUpperCase();
  return validUF.has(uf) ? uf : null;
}

export default function StateFlag({ uf, size = 'md', className = '' }: { uf?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const code = normalizeUF(uf);
  if (!code) return null;

  const px = size === 'sm' ? 34 : size === 'lg' ? 74 : 52;
  const src = `https://cdn.jsdelivr.net/gh/arthurreira/br-state-flags@0.1.0/svgs/${code}.svg`;
  const style: CSSProperties = { width: px, height: Math.round(px * 0.68) };

  return (
    <span className={`state-flag ${className}`.trim()} title={`${stateNames[code]} (${code})`}>
      <img src={src} alt={`Bandeira de ${stateNames[code]}`} width={px} height={Math.round(px * 0.68)} loading="lazy" style={style} />
    </span>
  );
}

export function getStateName(uf?: string | null) {
  const code = normalizeUF(uf);
  return code ? stateNames[code] : null;
}

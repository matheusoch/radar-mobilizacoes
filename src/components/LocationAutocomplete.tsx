import {useEffect,useId,useRef,useState} from 'react';
import {canonicalizeLocation,normalizeLocationKey} from '../lib/locationNormalization';

type LocationAutocompleteProps={
  canonicalize?:(value:string,options:string[])=>string;
  value:string;
  onChange:(value:string)=>void;
  options:string[];
  label:string;
  placeholder?:string;
  className?:string;
  disabled?:boolean;
  required?:boolean;
  maxLength?:number;
  autoComplete?:string;
  onBlur?:()=>void;
};

export default function LocationAutocomplete({
  value,onChange,options,label,placeholder='',className='',disabled=false,required=false,maxLength=100,autoComplete,onBlur,canonicalize
}:LocationAutocompleteProps){
  const generatedId=useId();
  const listId='location-options-'+generatedId.replace(/[^a-zA-Z0-9_-]/g,'');
  const rootRef=useRef<HTMLDivElement>(null);
  const [focused,setFocused]=useState(false);
  const key=normalizeLocationKey(value);
  const matches=key?options.filter(option=>normalizeLocationKey(option).includes(key)).sort((a,b)=>{
    const ak=normalizeLocationKey(a),bk=normalizeLocationKey(b);
    return Number(!ak.startsWith(key))-Number(!bk.startsWith(key))||a.localeCompare(b,'pt-BR');
  }).slice(0,8):[];
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(rootRef.current&&!rootRef.current.contains(event.target as Node))setFocused(false);};
    document.addEventListener('pointerdown',close);
    return()=>document.removeEventListener('pointerdown',close);
  },[]);
  const choose=(option:string)=>{onChange(canonicalize?canonicalize(option,options):canonicalizeLocation(option,options));setFocused(false);};
  return <div ref={rootRef} className="location-autocomplete">
    <input
      className={className}
      value={value}
      onFocus={()=>setFocused(true)}
      onChange={event=>{onChange(event.target.value);setFocused(true);}}
      onBlur={()=>{if(value.trim())onChange(canonicalize?canonicalize(value,options):canonicalizeLocation(value,options));onBlur?.();}}
      aria-label={label}
      aria-autocomplete="list"
      aria-expanded={focused&&matches.length>0}
      aria-controls={listId}
      role="combobox"
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      maxLength={maxLength}
      autoComplete={autoComplete||'off'}
    />
    {focused&&matches.length>0&&<div id={listId} className="location-suggestion-list" role="listbox" aria-label={'Sugestões para '+label}>
      {matches.map(option=><button type="button" role="option" aria-selected={normalizeLocationKey(option)===key} className="location-suggestion-option" onPointerDown={event=>event.preventDefault()} onClick={()=>choose(option)} key={option}>
        <span className="location-suggestion-icon">⌕</span><span>{option}</span>
      </button>)}
    </div>}
  </div>;
}

import {useId} from 'react';
import {canonicalizeLocation} from '../lib/locationNormalization';

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
  return <>
    <input
      className={className}
      value={value}
      onChange={event=>onChange(event.target.value)}
      onBlur={()=>{
        if(value.trim())onChange(canonicalize?canonicalize(value,options):canonicalizeLocation(value,options));
        onBlur?.();
      }}
      list={listId}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      maxLength={maxLength}
      autoComplete={autoComplete||'off'}
    />
    <datalist id={listId}>
      {options.map(option=><option key={option} value={option}/>)}
    </datalist>
  </>;
}

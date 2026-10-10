export type EventType = string;
export type EventStatus = 'confirmed' | 'updated' | 'warning' | 'pending';
export interface EventSource { id:string; platform:string; account_name:string; account_handle?:string; url:string; note?:string }
export interface MobilizationEvent { id:string; db_id?:string; created_at?:string|null; title:string; type:EventType; date:string; time?:string;
  time_label?:string; city:string; state:string; venue:string; address?:string; description?:string; status:EventStatus; public:boolean; lat?:number|null; lng?:number|null; image_url?:string|null; poster_sha256?:string|null; source_ids:string[]; notes?:string }

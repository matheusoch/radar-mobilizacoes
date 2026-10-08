import {supabase} from './supabase';

export type SecurityCategory='schedule'|'location'|'status'|'guidance'|'alert'|'other';
export type VerificationStatus='pending'|'confirmed'|'unconfirmed';
export type DiscussionAudience='public'|'interested';
export type ReportCategory='threat'|'false_info'|'fake_change'|'inappropriate'|'personal_data'|'other';
export type ReportTarget='event'|'comment'|'security_information';

export interface SecurityInformationItem{
  id:string;
  category:SecurityCategory;
  content:string;
  origin:string;
  verification_status:VerificationStatus;
  author_name:string;
  created_at:string;
  verified_at:string|null;
}

export interface EventDiscussionComment{
  id:string;
  author_name:string;
  content:string;
  audience:DiscussionAudience;
  status:'pending'|'published';
  created_at:string;
  edited_at:string|null;
  is_mine:boolean;
}

export interface EventInterestStatus{
  count:number;
  interested:boolean;
}

function client(){
  if(!supabase)throw new Error('A comunidade do evento exige uma conexão com o Supabase.');
  return supabase;
}

async function unwrap<T>(request:PromiseLike<{data:T|null;error:{message:string}|null}>):Promise<T>{
  const{data,error}=await request;
  if(error)throw new Error(error.message);
  if(data===null)throw new Error('O servidor não retornou dados.');
  return data;
}

async function execute(request:PromiseLike<{error:{message:string}|null}>):Promise<void>{
  const{error}=await request;
  if(error)throw new Error(error.message);
}

export function isEventCommunityAvailable(){
  return Boolean(supabase);
}

export function getSecurityInformation(eventSlug:string){
  return unwrap<SecurityInformationItem[]>(client().rpc('get_event_security_information',{p_event_slug:eventSlug}));
}

export function getEventDiscussion(eventSlug:string,audience:DiscussionAudience){
  return unwrap<EventDiscussionComment[]>(client().rpc('get_event_discussion',{p_event_slug:eventSlug,p_audience:audience}));
}

export function getEventInterestStatus(eventSlug:string){
  return unwrap<EventInterestStatus>(client().rpc('get_event_interest_status',{p_event_slug:eventSlug}));
}

export function toggleEventInterest(eventSlug:string,interested:boolean){
  return unwrap<EventInterestStatus>(client().rpc('toggle_event_interest',{p_event_slug:eventSlug,p_interested:interested}));
}

export function submitEventComment(eventSlug:string,content:string,audience:DiscussionAudience){
  return unwrap<string>(client().rpc('submit_event_comment',{p_event_slug:eventSlug,p_content:content,p_audience:audience}));
}

export function updateEventComment(commentId:string,content:string){
  return execute(client().rpc('update_event_comment',{p_comment_id:commentId,p_content:content}));
}

export function deleteEventComment(commentId:string){
  return execute(client().rpc('delete_event_comment',{p_comment_id:commentId}));
}

export function submitEventSecurityInformation(eventSlug:string,category:SecurityCategory,content:string,origin:string){
  return unwrap<string>(client().rpc('submit_event_security_information',{p_event_slug:eventSlug,p_category:category,p_content:content,p_origin:origin}));
}

export function reportEventCommunity(eventSlug:string,targetType:ReportTarget,targetId:string|null,category:ReportCategory,details:string){
  return unwrap<string>(client().rpc('report_event_community',{p_event_slug:eventSlug,p_target_type:targetType,p_target_id:targetId,p_category:category,p_details:details}));
}

export type ModerationTargetType='report'|'comment'|'security_information';
export type ModerationAction='resolve_report'|'publish_comment'|'hide_comment'|'remove_comment'|'restore_comment'|'confirm_information'|'unconfirm_information'|'hide_information'|'restore_information'|'suspend_user';

export interface ModerationQueue{
  can_manage_moderators:boolean;
  reports:Array<{id:string;event_id:string;event_slug:string;event_title:string;target_type:ReportTarget;comment_id:string|null;security_information_id:string|null;category:ReportCategory;details:string;status:'open';created_at:string;reporter_name:string;target_content:string}>;
  security_information:Array<{id:string;event_id:string;event_slug:string;event_title:string;category:SecurityCategory;content:string;origin:string;author_name:string;verification_status:'pending'|'hidden'|'unconfirmed';created_at:string}>;
  comments:Array<{id:string;event_id:string;event_slug:string;event_title:string;author_name:string;content:string;audience:DiscussionAudience;status:'pending'|'hidden'|'removed';created_at:string}>;
  actions:Array<{target_type:string;target_id:string;action:string;reason:string;created_at:string;actor_name:string}>;
}

export function getEventModerationQueue(){
  return unwrap<ModerationQueue>(client().rpc('get_event_moderation_queue'));
}

export function moderateEventCommunity(targetType:ModerationTargetType,targetId:string,action:ModerationAction,reason='',suspendHours=24){
  return execute(client().rpc('moderate_event_community',{p_target_type:targetType,p_target_id:targetId,p_action:action,p_reason:reason,p_suspend_hours:suspendHours}));
}

export function setEventModerator(userId:string,enabled:boolean){
  return execute(client().rpc('set_event_moderator',{p_user_id:userId,p_enabled:enabled}));
}
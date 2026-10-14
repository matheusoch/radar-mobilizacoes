import {Link} from 'react-router-dom';
import {ShieldCheck,Mail,MapPin} from 'lucide-react';

export default function EmailPrivacyPage(){
  return <div className="container page narrow city-digest-page">
    <div className="eyebrow"><ShieldCheck size={15}/> PRIVACIDADE</div>
    <h1>Privacidade dos alertas por e-mail.</h1>
    <p className="page-lead">Os alertas por e-mail são opcionais e separados da criação de uma conta para participar do chat.</p>
    <div className="city-digest-policy">
      <section><h2><Mail size={17}/> O que é utilizado</h2><p>O endereço de e-mail da sua conta, a cidade e a UF escolhidas e o formato do resumo. A cidade e a UF servem para filtrar os eventos; não usamos a localização exata do aparelho.</p></section>
      <section><h2>Finalidade</h2><p>Enviar às 8h (horário de Brasília), quando existirem eventos públicos relevantes, um resumo de hoje e dos próximos sete dias para a cidade/UF cadastrada. A preferência não é ativada sem uma ação afirmativa.</p></section>
      <section><h2>Compartilhamento e remetente</h2><p>Para entregar as mensagens, o endereço de e-mail e o conteúdo do resumo serão processados por um provedor de envio de e-mail. A conta do provedor, as credenciais de envio e a chave secreta ficam no servidor e nunca no navegador. O remetente público será o nome do projeto, não o e-mail pessoal do mantenedor.</p></section>
      <section><h2>Cancelamento e controle</h2><p>É possível desativar os resumos na página de preferências ou pelo link de cancelamento incluído em cada mensagem. Desativar não apaga a conta da Agenda nem altera outras funcionalidades. Você pode solicitar acesso, correção ou exclusão dos dados ligados à sua conta.</p></section>
      <section><h2>Prazo e ativação</h2><p>A configuração é mantida enquanto a preferência estiver ativa, para evitar reenvios e registrar a data do consentimento. O envio só é ligado após configurar e validar o domínio do remetente, o provedor, o agendamento e os dados de contato exigidos pelo serviço.</p></section>
    </div>
    <div className="city-digest-actions"><Link to="/preferencias-alertas" className="button primary">Gerenciar preferências</Link><Link to="/" className="button ghost">Voltar à agenda</Link></div>
    <p className="city-digest-policy-note">Esta página descreve o funcionamento técnico proposto. Antes de ativar envios públicos, o projeto ainda precisa publicar um canal de contato do responsável pelo tratamento e confirmar os dados do remetente.</p>
  </div>;
}

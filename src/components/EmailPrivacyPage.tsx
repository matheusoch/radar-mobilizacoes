import {Link} from 'react-router-dom';
import {ShieldCheck,Mail,MapPin,Bell} from 'lucide-react';

export default function EmailPrivacyPage(){
  return <div className="container page narrow city-digest-page">
    <div className="eyebrow"><ShieldCheck size={15}/> PRIVACIDADE</div>
    <h1>Privacidade da sua cidade e dos alertas.</h1>
    <p className="page-lead">Informar uma cidade preferida é opcional e ajuda a personalizar a agenda. As notificações no site e os resumos por e-mail são opções separadas.</p>
    <div className="city-digest-policy">
      <section><h2><MapPin size={17}/> O que é utilizado</h2><p>A cidade e a UF informadas por você ficam associadas à sua conta para permitir filtros rápidos na página inicial, no calendário e no mapa. Não usamos a localização exata do aparelho nem tentamos inferir onde você está.</p></section>
      <section><h2><Bell size={17}/> Notificações dentro do site</h2><p>Se você ativar essa opção, o sino de notificações poderá informar novos eventos públicos da cidade e do estado cadastrados. A preferência pode ser desativada a qualquer momento; salvar a cidade não ativa automaticamente as notificações.</p></section>
      <section><h2><Mail size={17}/> Alertas por e-mail</h2><p>O endereço de e-mail da conta é usado apenas se você der consentimento específico para o resumo diário. Quando o serviço estiver ativado, a cidade/UF e o formato escolhido servem para filtrar eventos públicos de hoje e dos próximos sete dias. O consentimento por e-mail é independente dos filtros da agenda e dos alertas dentro do site.</p></section>
      <section><h2>Compartilhamento e remetente</h2><p>Para entregar mensagens, o endereço de e-mail e o conteúdo do resumo serão processados pelo provedor de envio. Credenciais e chaves secretas ficam no servidor, nunca no navegador. O remetente público será o nome do projeto, não o e-mail pessoal do mantenedor.</p></section>
      <section><h2>Cancelamento e controle</h2><p>Você pode alterar cidade/UF e ativar ou desativar os canais na página de preferências. Os resumos por e-mail também terão link de cancelamento. Desativar alertas não apaga a conta nem remove os filtros personalizados. Você pode solicitar acesso, correção ou exclusão dos dados ligados à sua conta.</p></section>
      <section><h2>Ativação</h2><p>O envio por e-mail só será ligado após configurar e validar o domínio do remetente, o provedor, o agendamento e os dados de contato exigidos pelo serviço. Enquanto isso, é possível salvar uma cidade e usar a personalização da agenda ou, se selecionado, os alertas internos.</p></section>
    </div>
    <div className="city-digest-actions"><Link to="/preferencias-alertas" className="button primary">Gerenciar preferências</Link><Link to="/" className="button ghost">Voltar à agenda</Link></div>
    <p className="city-digest-policy-note">Antes de ativar envios públicos por e-mail, o projeto ainda precisa publicar um canal de contato do responsável pelo tratamento e confirmar os dados do remetente.</p>
  </div>;
}

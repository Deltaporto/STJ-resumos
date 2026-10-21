// Endereço do proxy do Assistente de IA (Cloudflare Worker em worker/).
// Vazio = o botão "Assistente" não aparece no portal.
// Depois de publicar o proxy, cole aqui o endereço que o "wrangler deploy" mostrar, por exemplo:
//   window.ASSISTENTE_CONFIG = { apiUrl: 'https://stj-assistente.SEU-SUBDOMINIO.workers.dev' };
window.ASSISTENTE_CONFIG = { apiUrl: '' };

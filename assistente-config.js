// Endereço do proxy do Assistente de IA (Cloudflare Worker em worker/).
// Vazio = o botão "Assistente" não aparece no portal.
window.ASSISTENTE_CONFIG = {
    apiUrl: 'https://stj-assistente.rafael-aa-adv.workers.dev',
    // Endereço público do portal (usado no aviso quando o index.html é aberto como arquivo)
    siteUrl: 'https://deltaporto.github.io/STJ-resumos/',
};

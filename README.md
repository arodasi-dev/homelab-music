# Música (PWA)

Toca no iPhone as músicas que o `yt-music-agent` (pasta `homelab/yt-music-agent`) baixou do YouTube,
inclusive com a tela bloqueada. Site estático (HTML/CSS/JS puro), sem build.

## Publicar (GitHub Pages)
1. Crie o repo **`homelab-music`** em `arodasi-dev` e suba este conteúdo na `main`.
2. Em **Settings → Pages → Source**, escolha **GitHub Actions**. O workflow publica a cada push.
3. O endereço sai como `https://arodasi-dev.github.io/homelab-music/`.
   O `ALLOWED_ORIGIN` do agente é só a origem: `https://arodasi-dev.github.io`.

## Instalar no iPhone
1. Instale o **Tailscale** e deixe conectado.
2. Abra o endereço no **Safari** → Compartilhar → *Adicionar à Tela de Início*.
3. Abra o app pelo ícone. Na 1ª vez, informe a URL do agente e o token.

## Dicas
- Pra tocar com a tela bloqueada, comece a música com o app aberto; os controles aparecem na tela de bloqueio.
- O iOS pode pausar o áudio de PWA em alguns casos (ligação, outro app de áudio). Se isso virar problema
  no dia a dia, dá pra migrar só o front pra app nativo, sem mexer no servidor.

## Segurança
URL e token ficam só no `localStorage` do aparelho (nada no repo). O agente só é alcançável pela tailnet.
O áudio e as capas pedem o token na URL (`?t=`), porque `<audio>` e `<img>` não mandam header.

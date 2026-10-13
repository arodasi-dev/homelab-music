// Cartão vertical (1080x1920, formato de story) com a música que está tocando.
const CARD = {
  width: 1080,
  height: 1920,
  bg: "#1a1412",
  text: "#f6eeea",
  muted: "#a8978f",
  accent: "#ff7f5c",
  label: "#ffc9b6",
  coverBg: "#5a2a19",
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  coverSize: 780,
  coverTop: 340,
  textWidth: 880,
  titleMax: 68, // o título nunca é cortado: encolhe a letra até caber em 3 linhas e, se não couber, quebra em mais
  titleMin: 40,
  titleMaxLines: 3,
  bars: 9,
  safeBottom: 270, // o Instagram cobre o pé do story com a barra de resposta
  signature: "music by isadora",
};

function loadCover(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // sem isso o canvas fica "sujo" e não dá pra exportar a imagem
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Alturas estáveis a partir do id: a mesma música sempre gera o mesmo desenho de barras.
function barHeights(seed, count) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: count }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return 0.3 + ((h % 1000) / 1000) * 0.7;
  });
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Texto com espaço entre as letras, centralizado em `cx` (o `letterSpacing` do canvas não existe em todo Safari).
function spacedText(ctx, text, cx, y, spacing) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  let x = cx - (widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1)) / 2;
  ctx.textAlign = "left";
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(attempt).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  }
  lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

function fitTitle(ctx, title) {
  let size = CARD.titleMax;
  for (;;) {
    ctx.font = `700 ${size}px ${CARD.font}`;
    const lines = wrapLines(ctx, title, CARD.textWidth, Infinity);
    if (lines.length <= CARD.titleMaxLines || size <= CARD.titleMin) return { lines, size };
    size -= 4;
  }
}

function starPath(cx, cy, outer) {
  const path = new Path2D();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : outer * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const [x, y] = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

function drawCover(ctx, cover, x, y, size) {
  ctx.save();
  roundedRect(ctx, x, y, size, size, 56);
  ctx.clip();
  ctx.fillStyle = CARD.coverBg;
  ctx.fillRect(x, y, size, size);
  if (cover) {
    const side = Math.min(cover.width, cover.height); // recorte quadrado no centro
    ctx.drawImage(cover, (cover.width - side) / 2, (cover.height - side) / 2, side, side, x, y, size, size);
  } else {
    // Sem capa (ainda baixando ou falhou): ícone de música.
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(size / 24 / 2.6, size / 24 / 2.6);
    ctx.translate(-12, -10.5);
    ctx.strokeStyle = CARD.label;
    ctx.lineWidth = 1.5;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.stroke(new Path2D("M9 18V5l12-2v13"));
    for (const [cx, cy] of [[6, 18], [18, 16]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderCard(track, cover) {
  const { width, height } = CARD;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const cx = width / 2;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = CARD.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = CARD.label;
  ctx.font = `600 38px ${CARD.font}`;
  spacedText(ctx, "OUVINDO AGORA", cx, 290, 10);

  drawCover(ctx, cover, (width - CARD.coverSize) / 2, CARD.coverTop, CARD.coverSize);

  // Equalizador abaixo da capa.
  const barWidth = 26;
  const gap = 20;
  const maxBar = 100;
  const baseline = CARD.coverTop + CARD.coverSize + 50 + maxBar;
  const total = CARD.bars * barWidth + (CARD.bars - 1) * gap;
  ctx.fillStyle = CARD.accent;
  barHeights(track.id, CARD.bars).forEach((ratio, i) => {
    const h = maxBar * ratio;
    roundedRect(ctx, cx - total / 2 + i * (barWidth + gap), baseline - h, barWidth, h, barWidth / 2);
    ctx.fill();
  });

  ctx.textAlign = "center";
  ctx.fillStyle = CARD.text;
  const { lines, size } = fitTitle(ctx, track.title);
  let y = baseline + 95;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += size * 1.2;
  }

  // Assinatura: texto + estrela desenhada, centralizados juntos.
  ctx.font = `500 40px ${CARD.font}`;
  const star = 22;
  const gapStar = 20;
  const textWidth = ctx.measureText(CARD.signature).width;
  const startX = cx - (textWidth + gapStar + star * 2) / 2;
  const signatureY = height - CARD.safeBottom;
  ctx.fillStyle = CARD.muted;
  ctx.textAlign = "left";
  ctx.fillText(CARD.signature, startX, signatureY);
  ctx.fillStyle = CARD.accent;
  ctx.fill(starPath(startX + textWidth + gapStar + star, signatureY - 14, star));
  return canvas;
}

// `coverUrl` vazio = cartão sem capa (aparece o ícone de música no lugar).
async function buildShareCard(track, coverUrl) {
  return renderCard(track, coverUrl ? await loadCover(coverUrl) : null);
}

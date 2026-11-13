export const normalizarValor = (valorBruto, linha) => {
  const texto = `${valorBruto ?? ""}`.trim();
  if (!texto) {
    const label =
      typeof linha === "number"
        ? ` na linha ${linha}`
        : linha
          ? ` (${linha})`
          : "";
    throw new Error(`Valor ausente${label}`);
  }

  const somenteNumeros = texto.replace(/[^0-9,.-]/g, "");
  const usaVirgula = somenteNumeros.includes(",");
  const semMilhar = usaVirgula
    ? somenteNumeros.replace(/\./g, "")
    : somenteNumeros;
  const normalizado = semMilhar.replace(",", ".");
  const numero = Number(normalizado);

  if (!/[0-9]/.test(somenteNumeros) || !Number.isFinite(numero)) {
    const label =
      typeof linha === "number"
        ? ` na linha ${linha}`
        : linha
          ? ` (${linha})`
          : "";
    throw new Error(`Valor inválido${label}: "${valorBruto}"`);
  }

  return numero;
};

export const buildLotePreview = (textoLote) => {
  const linhas = `${textoLote || ""}`
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

  return linhas.map((linha, index) => {
    const partes = linha.includes("\t") ? linha.split("\t") : linha.split(";");
    const [data = "", descricao = "", valorBruto = ""] = partes;
    const preview = {
      numero: index + 1,
      raw: linha,
      data: data.trim(),
      descricao: descricao.trim(),
      valor: valorBruto.trim(),
      erro: "",
    };

    if (partes.length < 3) {
      preview.erro = "Formato inválido. Use Data, Descrição e Valor.";
      return preview;
    }

    if (!preview.data || !preview.descricao || !preview.valor) {
      preview.erro = "Preencha data, descrição e valor.";
      return preview;
    }

    try {
      normalizarValor(preview.valor, preview.numero);
    } catch (error) {
      preview.erro = error.message;
    }

    return preview;
  });
};

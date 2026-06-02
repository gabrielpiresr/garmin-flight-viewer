const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PAGE_W = 595.32;
const PAGE_H = 841.92;
const MARGIN_X = 50;
const MARGIN_Y = 40;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BORDER = rgb(0, 0, 0);
const INK = rgb(0.1, 0.1, 0.1);
const LABEL_SIZE = 7;
const VALUE_SIZE = 9;
const SECTION_SIZE = 9;

const TERMO_MATRICULA_TEXTO =
  "DECLARO QUE ESTE(A) ALUNO(A) ENCONTRA-SE MATRICULADO(A) NESTE CURSO, A PARTIR DE {dataInicio}, MATRÍCULA Nº {numeroMatricula}, JÁ TENDO SIDO ENTREGUES AS CÓPIAS DA DOCUMENTAÇÃO EXIGIDA.";

const TERMO_RESPONSABILIDADE_TEXTO =
  "DECLARO, PARA FINS JURÍDICOS, QUE OS DADOS POR MIM FORNECIDOS SÃO A EXPRESSÃO DA VERDADE E QUE, ANTES DE PREENCHER ESTE FORMULÁRIO, RECEBI TODAS AS INFORMAÇÕES PERTINENTES AO CURSO DE AVIACÃO CIVIL CONTIDAS NO REGULAMENTO DA PARTE TEÓRICA (E OU PRÁTICA) DO CURSO, RELATIVAS À ESTRUTURA CURRICULAR E À PROGRAMAÇÃO DE SEU DESENVOLVIMENTO; ÀS NORMAS DISCIPLINARES, OPERACIONAIS* E ADMINISTRATIVAS; E AINDA, AS REFERENTES AO SISTEMA DE AVALIAÇÃO E DE APROVAÇÃO UTILIZADO POR ESTA ESCOLA.";

const TERMO_RESPONSABILIDADE_NOTA =
  "(*) CONSTARÁ SOMENTE NA FICHA DE INSCRIÇÃO/MATRÍCULA PARA O CURSO PRÁTICO";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length !== 11) return String(value || "").trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length < 10) return String(value || "").trim();
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function display(value) {
  const text = String(value ?? "").trim();
  return text || "";
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function checkbox(checked) {
  return checked ? "( X )" : "(   )";
}

async function embedImageFromBuffer(pdf, bytes) {
  if (!bytes || !bytes.length) return null;
  try {
    return await pdf.embedJpg(bytes);
  } catch {
    try {
      return await pdf.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

async function embedImageFromDataUrl(pdf, dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(raw);
  if (!match) return null;
  return embedImageFromBuffer(pdf, Buffer.from(match[2], "base64"));
}

function formatLicenses(licenses) {
  if (!Array.isArray(licenses) || !licenses.length) return "";
  return licenses
    .map((item) => {
      const name = display(item?.licenca || item?.license);
      const exp = display(item?.expedicao || item?.validade);
      return exp ? `${name} (${exp})` : name;
    })
    .filter(Boolean)
    .join("\n");
}

function formatRatings(ratings) {
  if (!Array.isArray(ratings) || !ratings.length) return "";
  return ratings
    .map((item) => {
      const name = display(item?.habilitacao || item?.rating);
      const val = display(item?.validade);
      return val ? `${name} (${val})` : name;
    })
    .filter(Boolean)
    .join("\n");
}

class EnrollmentPdfLayout {
  constructor(pdf, fonts) {
    this.pdf = pdf;
    this.font = fonts.regular;
    this.fontBold = fonts.bold;
    this.page = null;
    this.y = 0;
    this.bottom = MARGIN_Y;
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_Y;
    return this.page;
  }

  ensureSpace(height) {
    if (!this.page) this.newPage();
    if (this.y - height < this.bottom) this.newPage();
  }

  drawRect(x, y, w, h, options = {}) {
    const { fill, border = true } = options;
    if (fill) {
      this.page.drawRectangle({ x, y, width: w, height: h, color: fill, borderWidth: border ? 0.8 : 0, borderColor: BORDER });
    } else if (border) {
      this.page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.8, borderColor: BORDER });
    }
  }

  drawLabelValue(x, y, w, h, label, value, opts = {}) {
    const pad = 4;
    const labelSize = opts.labelSize || LABEL_SIZE;
    const valueSize = opts.valueSize || VALUE_SIZE;
    const labelLines = wrapText(String(label || "").toUpperCase(), this.fontBold, labelSize, w - pad * 2);
    let labelY = y + h - pad - labelSize;
    for (const line of labelLines) {
      this.page.drawText(line, { x: x + pad, y: labelY, size: labelSize, font: this.fontBold, color: INK });
      labelY -= labelSize + 1;
    }
    const valueText = display(value);
    const lines = wrapText(valueText, this.font, valueSize, w - pad * 2).slice(0, opts.maxLines || 3);
    let vy = labelY - 6;
    for (const line of lines) {
      this.page.drawText(line, { x: x + pad, y: vy, size: valueSize, font: this.font, color: INK });
      vy -= valueSize + 2;
    }
  }

  drawHeaderWithPhoto(leftRows, photoImage, photoColW) {
    const mainW = CONTENT_W - photoColW;
    const totalH = leftRows.reduce((sum, row) => sum + row.height, 0);
    this.ensureSpace(totalH);
    const yTop = this.y;
    const yBottom = yTop - totalH;

    this.drawRect(MARGIN_X + mainW, yBottom, photoColW, totalH);
    const fotoTw = this.fontBold.widthOfTextAtSize("FOTO", 8);
    this.page.drawText("FOTO", {
      x: MARGIN_X + mainW + (photoColW - fotoTw) / 2,
      y: yTop - 14,
      size: 8,
      font: this.fontBold,
      color: INK,
    });
    if (photoImage) {
      const pad = 8;
      const maxW = photoColW - pad * 2;
      const maxH = totalH - 22;
      const scale = Math.min(maxW / photoImage.width, maxH / photoImage.height, 1);
      const iw = photoImage.width * scale;
      const ih = photoImage.height * scale;
      this.page.drawImage(photoImage, {
        x: MARGIN_X + mainW + (photoColW - iw) / 2,
        y: yBottom + (totalH - ih) / 2 - 4,
        width: iw,
        height: ih,
      });
    }

    let rowTop = yTop;
    for (const row of leftRows) {
      rowTop -= row.height;
      if (row.cells?.length) {
        let x = MARGIN_X;
        for (const cell of row.cells) {
          const w = cell.width ?? mainW;
          this.drawRect(x, rowTop, w, row.height);
          this.drawLabelValue(x, rowTop, w, row.height, cell.label, cell.value, cell.opts);
          x += w;
        }
      } else {
        this.drawRect(MARGIN_X, rowTop, mainW, row.height);
        this.drawLabelValue(MARGIN_X, rowTop, mainW, row.height, row.label, row.value, row.opts);
      }
    }
    this.y = yBottom;
  }

  drawSignatureCells(cells, options = {}) {
    const labelSize = options.labelSize || 7;
    const valueSize = options.valueSize || 7;
    const pad = 4;
    const gap = options.gap ?? 4;
    const minHeight = options.minHeight || 64;

    const layouts = cells.map((cell) => {
      const w = cell.width;
      const labelLines = wrapText(String(cell.label || "").toUpperCase(), this.fontBold, labelSize, w - pad * 2);
      const valueLines = wrapText(display(cell.value), this.font, valueSize, w - pad * 2).slice(0, options.maxValueLines || 4);
      const h = Math.max(
        minHeight,
        pad * 2 + labelLines.length * (labelSize + 1) + 8 + valueLines.length * (valueSize + 2),
      );
      return { ...cell, w, labelLines, valueLines, h };
    });
    const rowHeight = Math.max(...layouts.map((item) => item.h));

    this.ensureSpace(rowHeight);
    const y = this.y - rowHeight;
    let x = MARGIN_X;
    for (const cell of layouts) {
      this.drawRect(x, y, cell.w, rowHeight);
      let labelY = y + rowHeight - pad - labelSize;
      for (const line of cell.labelLines) {
        this.page.drawText(line, { x: x + pad, y: labelY, size: labelSize, font: this.fontBold, color: INK });
        labelY -= labelSize + 1;
      }
      let valueY = labelY - 6;
      for (const line of cell.valueLines) {
        this.page.drawText(line, { x: x + pad, y: valueY, size: valueSize, font: this.font, color: INK });
        valueY -= valueSize + 2;
      }
      x += cell.w + gap;
    }
    this.y = y;
  }

  drawRow(cells, rowHeight) {
    this.ensureSpace(rowHeight);
    const y = this.y - rowHeight;
    let x = MARGIN_X;
    for (const cell of cells) {
      const w = cell.width;
      this.drawRect(x, y, w, rowHeight);
      if (cell.centerTitle) {
        const title = String(cell.centerTitle);
        const tw = this.fontBold.widthOfTextAtSize(title, SECTION_SIZE);
        this.page.drawText(title, {
          x: x + (w - tw) / 2,
          y: y + rowHeight / 2 - SECTION_SIZE / 2,
          size: SECTION_SIZE,
          font: this.fontBold,
          color: INK,
        });
      } else if (cell.sectionNumber) {
        this.page.drawText(String(cell.sectionNumber), {
          x: x + 6,
          y: y + rowHeight / 2 - 4,
          size: 10,
          font: this.fontBold,
          color: INK,
        });
      } else if (cell.checkboxText) {
        const lines = wrapText(`${checkbox(cell.checked)} ${cell.checkboxText}`, this.font, 8, w - 8);
        let cy = y + rowHeight - 10;
        for (const line of lines) {
          this.page.drawText(line, { x: x + 4, y: cy, size: 8, font: this.font, color: INK });
          cy -= 10;
        }
      } else if (cell.paragraph) {
        const lines = wrapText(cell.paragraph, this.font, 8, w - 8);
        let cy = y + rowHeight - 10;
        for (const line of lines) {
          this.page.drawText(line, { x: x + 4, y: cy, size: 8, font: this.font, color: INK });
          cy -= 10;
        }
      } else if (cell.image) {
        const img = cell.image;
        const maxW = w - 8;
        const maxH = rowHeight - 8;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const iw = img.width * scale;
        const ih = img.height * scale;
        this.page.drawImage(img, {
          x: x + (w - iw) / 2,
          y: y + (rowHeight - ih) / 2,
          width: iw,
          height: ih,
        });
      } else if (cell.photoLabel) {
        const tw = this.font.widthOfTextAtSize("FOTO", 8);
        this.page.drawText("FOTO", { x: x + (w - tw) / 2, y: y + rowHeight - 14, size: 8, font: this.fontBold, color: INK });
        if (cell.photoImage) {
          const img = cell.photoImage;
          const maxW = w - 10;
          const maxH = rowHeight - 24;
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          const iw = img.width * scale;
          const ih = img.height * scale;
          this.page.drawImage(img, {
            x: x + (w - iw) / 2,
            y: y + 6,
            width: iw,
            height: ih,
          });
        }
      } else {
        this.drawLabelValue(x, y, w, rowHeight, cell.label, cell.value, cell.opts);
      }
      x += w;
    }
    this.y = y;
  }

  drawParagraph(text, size = 8, minHeight = 48) {
    const lines = wrapText(text, this.font, size, CONTENT_W - 8);
    const rowHeight = Math.max(minHeight, lines.length * (size + 3) + 12);
    this.drawRow([{ width: CONTENT_W, paragraph: text }], rowHeight);
  }

  drawSignatureBlock(label, signedText, width = CONTENT_W / 2) {
    const h = 56;
    this.ensureSpace(h);
    const y = this.y - h;
    this.drawRect(MARGIN_X, y, width, h);
    const cx = MARGIN_X;
    this.page.drawText(label, {
      x: cx + 4,
      y: y + h - 12,
      size: 8,
      font: this.fontBold,
      color: INK,
    });
    if (signedText) {
      const lines = wrapText(signedText, this.font, 7, width - 8).slice(0, 4);
      let ly = y + h - 24;
      for (const line of lines) {
        this.page.drawText(line, { x: cx + 4, y: ly, size: 7, font: this.font, color: INK });
        ly -= 9;
      }
    }
    this.y = y;
  }
}

function buildFormData(input) {
  const p = input.profileData || {};
  const extras = input.extras || {};
  return {
    schoolName: display(input.brand?.schoolName) || "Escola de Aviação Civil",
    courseName: display(extras.courseName),
    fullName: display(p.fullName),
    sex: display(extras.sex),
    address: display(p.endereco),
    cep: display(extras.cep),
    city: display(extras.city),
    state: display(extras.state),
    phone: formatPhone(p.phone),
    birthDate: display(p.birthDateFormatted || p.birthDate),
    maritalStatus: display(p.estadoCivil),
    birthplace: display(extras.birthplace),
    nationality: display(p.nacionalidade) || "Brasil",
    fatherName: display(extras.fatherName),
    motherName: display(extras.motherName),
    rg: display(p.rg),
    rgIssuer: display(p.rgOrgaoExpedidor),
    rgIssueDate: display(extras.rgIssueDate || p.rgIssueDate),
    cpf: formatCpf(p.cpf) || onlyDigits(p.cpf),
    anacCode: display(p.anacCode),
    educationLevel: display(extras.educationLevel),
    educationPeriod: display(extras.educationPeriod),
    educationCourse: display(extras.educationCourse),
    allergies: display(extras.allergies) || "Nenhuma",
    emergencyName: display(extras.emergencyName),
    emergencyRelation: display(extras.emergencyRelation),
    emergencyAddress: display(extras.emergencyAddress),
    emergencyPhone: formatPhone(extras.emergencyPhone),
    medicalClass: display(extras.medicalClass),
    medicalIssuer: display(extras.medicalIssuer),
    medicalValidUntil: display(extras.medicalValidUntil),
    licensesText: formatLicenses(extras.anacLicenses),
    ratingsText: formatRatings(extras.anacRatings),
    enrollmentStartDate: display(extras.enrollmentStartDate),
    enrollmentNumber: display(extras.enrollmentNumber),
    signLocation: display(extras.signLocation),
    issuedAt: display(p.issuedAtFormatted),
    docs: extras.documentFlags || {},
    hasHighSchoolCert: Boolean(extras.hasHighSchoolCert),
  };
}

async function renderEnrollmentLayout(pdf, fonts, images, data, signatures, brand) {
  const layout = new EnrollmentPdfLayout(pdf, fonts);
  const photoColW = 168;
  const mainW = CONTENT_W - photoColW;

  // Cabeçalho: logo + título
  layout.drawRow(
    [
      {
        width: mainW * 0.36,
        image: images.logoImage,
        opts: { maxLines: 1 },
      },
      {
        width: mainW * 0.64 + photoColW,
        centerTitle: "FICHA DE MATRÍCULA",
      },
    ],
    64,
  );

  layout.drawHeaderWithPhoto(
    [
      { height: 46, label: "DENOMINAÇÃO DA ESCOLA", value: data.schoolName },
      { height: 36, label: "CURSO DE", value: data.courseName },
      {
        height: 38,
        cells: [
          { width: mainW * 0.82, label: "NOME", value: data.fullName },
          { width: mainW * 0.18, label: "SEXO", value: data.sex },
        ],
      },
    ],
    images.photoImage,
    photoColW,
  );

  // Seção 1 — Dados pessoais
  layout.drawRow(
    [{ width: 22, sectionNumber: "1" }, { width: CONTENT_W - 22, centerTitle: "DADOS PESSOAIS" }],
    22,
  );
  layout.drawRow(
    [
      { width: CONTENT_W * 0.78, label: "ENDEREÇO RESIDENCIAL", value: data.address },
      { width: CONTENT_W * 0.22, label: "CEP", value: data.cep },
    ],
    36,
  );
  layout.drawRow(
    [
      { width: CONTENT_W * 0.5, label: "CIDADE", value: data.city },
      { width: CONTENT_W * 0.12, label: "U.F.", value: data.state },
      { width: CONTENT_W * 0.38, label: "TELEFONE(S)", value: data.phone },
    ],
    36,
  );
  layout.drawRow(
    [
      { width: CONTENT_W * 0.28, label: "DATA NASCIMENTO", value: data.birthDate },
      { width: CONTENT_W * 0.22, label: "ESTADO CIVIL", value: data.maritalStatus },
      { width: CONTENT_W * 0.28, label: "NATURALIDADE", value: data.birthplace },
      { width: CONTENT_W * 0.22, label: "NACIONALIDADE", value: data.nationality },
    ],
    36,
  );
  layout.drawRow(
    [
      { width: CONTENT_W / 2, label: "FILIAÇÃO: PAI", value: data.fatherName },
      { width: CONTENT_W / 2, label: "MÃE", value: data.motherName },
    ],
    36,
  );

  // Seção 2 — Documentação
  layout.drawRow(
    [{ width: 22, sectionNumber: "2" }, { width: CONTENT_W - 22, centerTitle: "DOCUMENTAÇÃO" }],
    22,
  );
  layout.drawRow(
    [
      { width: CONTENT_W * 0.32, label: "IDENTIDADE Nº", value: data.rg },
      { width: CONTENT_W * 0.18, label: "ORGÃO EXPEDIDOR", value: data.rgIssuer },
      { width: CONTENT_W * 0.18, label: "DATA EMISSÃO", value: data.rgIssueDate },
      { width: CONTENT_W * 0.16, label: "CPF Nº", value: data.cpf },
      { width: CONTENT_W * 0.16, label: "ANAC", value: data.anacCode },
    ],
    36,
  );

  // Seção 3 — Nível de instrução
  layout.drawRow(
    [{ width: 22, sectionNumber: "3" }, { width: CONTENT_W - 22, centerTitle: "NÍVEL DE INSTRUÇÃO" }],
    22,
  );
  layout.drawRow(
    [
      { width: CONTENT_W * 0.35, label: "ESCOLARIDADE", value: data.educationLevel },
      { width: CONTENT_W * 0.65, label: "", value: "" },
    ],
    28,
  );
  layout.drawRow(
    [
      { width: CONTENT_W * 0.35, label: "SÉRIE/PERÍODO (SE INCOMPLETO)", value: data.educationPeriod },
      { width: CONTENT_W * 0.65, label: "CURSO", value: data.educationCourse },
    ],
    36,
  );

  // Seção 4 — Informações adicionais
  layout.drawRow(
    [{ width: 22, sectionNumber: "4" }, { width: CONTENT_W - 22, centerTitle: "INFORMAÇÕES ADICIONAIS" }],
    22,
  );
  layout.drawParagraph(
    `É ALÉRGICO A ALGUM(NS) TIPO(S) DE MEDICAMENTO(S)? DESCREVA-OS:\n\n${data.allergies}`,
    8,
    52,
  );
  layout.drawParagraph(
    `EM CASO DE EMERGÊNCIA AVISAR A:\n\nNOME: ${data.emergencyName}\n\nGRAU DE PARENTESCO: ${data.emergencyRelation}\n\nENDEREÇO: ${data.emergencyAddress}\n\nTELEFONE(S): ${data.emergencyPhone}`,
    8,
    88,
  );

  // Seção 5 — Secretaria
  layout.drawRow(
    [{ width: 22, sectionNumber: "5" }, { width: CONTENT_W - 22, centerTitle: "A SER PREENCHIDO PELA SECRETARIA" }],
    22,
  );
  layout.drawRow(
    [
      {
        width: CONTENT_W,
        paragraph:
          "DOCUMENTAÇÃO APRESENTADA (CANDIDATOS BRASILEIROS)",
      },
    ],
    18,
  );
  layout.drawRow(
    [
      {
        width: CONTENT_W * 0.45,
        checkboxText:
          "Documento de identificação (RG, CNH ou outro documento válido em lei para identificação em todo o território nacional)",
        checked: data.docs.identification,
      },
      { width: CONTENT_W * 0.12, checkboxText: "CPF", checked: Boolean(data.cpf) },
      { width: CONTENT_W * 0.43, checkboxText: "TÍTULO DE ELEITOR", checked: data.docs.voterTitle },
    ],
    40,
  );
  layout.drawRow(
    [
      {
        width: CONTENT_W * 0.45,
        checkboxText: "CERTIFICADO MÉDICO AERONÁUTICO (CMA)",
        checked: data.docs.medical || Boolean(data.medicalValidUntil),
      },
      { width: CONTENT_W * 0.2, label: "CATEGORIA", value: data.medicalClass },
      { width: CONTENT_W * 0.18, label: "ÓRGÃO EXPEDITOR", value: data.medicalIssuer },
      { width: CONTENT_W * 0.17, label: "VÁLIDO ATÉ", value: data.medicalValidUntil },
    ],
    40,
  );
  layout.drawRow(
    [
      {
        width: CONTENT_W,
        checkboxText: "CERTIFICADO DE ESCOLARIDADE DO ENSINO MÉDIO",
        checked: data.hasHighSchoolCert,
      },
    ],
    22,
  );
  layout.drawRow(
    [{ width: CONTENT_W, checkboxText: "COMPROVANTE DE RESIDÊNCIA", checked: data.docs.proofOfResidence }],
    22,
  );
  layout.drawRow(
    [{ width: CONTENT_W, checkboxText: "CERTIFICADO MILITAR", checked: data.docs.militaryCertificate }],
    22,
  );

  // Seção 6 — Licenças ANAC
  layout.drawRow(
    [{ width: 22, sectionNumber: "6" }, { width: CONTENT_W - 22, centerTitle: "PARA PORTADORES DE LICENÇAS ANAC" }],
    22,
  );
  layout.drawRow(
    [
      { width: CONTENT_W / 2, label: "Tipo de Licença", value: data.licensesText, opts: { maxLines: 5 } },
      { width: CONTENT_W / 2, label: "Habilitações", value: data.ratingsText, opts: { maxLines: 5 } },
    ],
    Math.max(
      48,
      12 +
        (data.licensesText ? data.licensesText.split("\n").length : 0) * 10 +
        (data.ratingsText ? data.ratingsText.split("\n").length : 0) * 10,
    ),
  );

  // Termo de matrícula
  layout.drawRow([{ width: CONTENT_W, centerTitle: "TERMO DE MATRÍCULA" }], 22);
  const termoMatricula = TERMO_MATRICULA_TEXTO.replace("{dataInicio}", data.enrollmentStartDate || "___/___/______")
    .replace("{numeroMatricula}", data.enrollmentNumber || "___");
  layout.drawParagraph(termoMatricula, 8, 56);
  layout.drawRow(
    [{ width: CONTENT_W, paragraph: `DATA:  ${data.enrollmentStartDate || data.issuedAt || "___/___/______"}` }],
    18,
  );

  const adminSignText = signatures.admin
    ? `Assinado digitalmente pela escola em ${signatures.adminAt}`
    : "";
  const half = CONTENT_W / 2;
  layout.ensureSpace(56);
  const signRowY = layout.y - 56;
  layout.drawRect(MARGIN_X, signRowY, half - 2, 56);
  layout.drawRect(MARGIN_X + half + 2, signRowY, half - 2, 56);
  layout.page.drawText("DIRETOR OU PRESIDENTE", {
    x: MARGIN_X + 4,
    y: signRowY + 44,
    size: 8,
    font: layout.fontBold,
    color: INK,
  });
  layout.page.drawText("TESTEMUNHA", {
    x: MARGIN_X + half + 6,
    y: signRowY + 44,
    size: 8,
    font: layout.fontBold,
    color: INK,
  });
  if (adminSignText) {
    const lines = wrapText(adminSignText, layout.font, 7, half - 10);
    let ly = signRowY + 30;
    for (const line of lines) {
      layout.page.drawText(line, { x: MARGIN_X + 4, y: ly, size: 7, font: layout.font, color: INK });
      ly -= 9;
    }
  }
  layout.y = signRowY;

  // Termo de responsabilidade
  layout.drawRow([{ width: CONTENT_W, centerTitle: "TERMO DE RESPONSABILIDADE" }], 22);
  layout.drawParagraph(TERMO_RESPONSABILIDADE_TEXTO, 8, 72);
  layout.drawParagraph(TERMO_RESPONSABILIDADE_NOTA, 7, 24);

  const localData = data.signLocation && (data.enrollmentStartDate || data.issuedAt)
    ? `${data.signLocation}, ${data.enrollmentStartDate || data.issuedAt}`
    : data.signLocation || data.enrollmentStartDate || data.issuedAt || "";

  const halfGap = 4;
  const halfW = (CONTENT_W - halfGap) / 2;
  layout.drawSignatureCells(
    [
      { width: halfW, label: "LOCAL E DATA", value: localData },
      {
        width: halfW,
        label: "CANDIDATO",
        value: signatures.recipient
          ? `Assinado digitalmente por ${data.fullName} em ${signatures.recipientAt}`
          : "",
      },
    ],
    { minHeight: 58, gap: halfGap, maxValueLines: 4 },
  );
  layout.drawSignatureCells(
    [
      { width: halfW, label: "ASSINATURA DO RESPONSÁVEL (MENOR DE IDADE)", value: "" },
      { width: halfW, label: "ASSINATURA DO DIRETOR OU PRESIDENTE", value: adminSignText },
    ],
    { minHeight: 72, gap: halfGap, maxValueLines: 4 },
  );
}

async function buildEnrollmentFormPdf(options) {
  const {
    profileData,
    brand = {},
    logoDataUrl = null,
    photoBytes = null,
    signatures = {},
    issuedAt = new Date(),
    extras = {},
  } = options;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const issuedAtFormatted =
    issuedAt instanceof Date && !Number.isNaN(issuedAt.getTime())
      ? issuedAt.toLocaleDateString("pt-BR")
      : String(issuedAt || "");

  const [logoImage, photoImage] = await Promise.all([
    embedImageFromDataUrl(pdf, logoDataUrl),
    embedImageFromBuffer(pdf, photoBytes),
  ]);

  const data = buildFormData({
    profileData: { ...profileData, issuedAtFormatted },
    brand,
    extras,
  });

  await renderEnrollmentLayout(
    pdf,
    { regular: font, bold: fontBold },
    { logoImage, photoImage },
    data,
    signatures,
    brand,
  );

  return Buffer.from(await pdf.save());
}

module.exports = {
  buildEnrollmentFormPdf,
  formatCpf,
  formatPhone,
};

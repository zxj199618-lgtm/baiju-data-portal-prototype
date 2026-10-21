/**
 * 页面：audience-package
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    TOOL_META_TEMPLATE,
    canEditMenu,
    denyEdit,
    ep,
    mount
  } = window.PortalVue;


  /* ===== 业务工具箱 · 公共能力 ===== */

  const IDENTITY_SPECS = {
    "手机号": { pattern: /^1[3-9]\d{9}$/, hint: "11 位大陆手机号" },
    "OAID": { pattern: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, hint: "36 位 OAID（带连字符）" },
    "IDFA": { pattern: /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/, hint: "36 位 IDFA（带连字符）" },
    "IMEI": { pattern: /^\d{15}$/, hint: "15 位 IMEI" },
    "已加密 MD5": { pattern: /^[0-9a-fA-F]{32}$/, hint: "32 位十六进制 MD5" },
    "已加密 SHA256": { pattern: /^[0-9a-fA-F]{64}$/, hint: "64 位十六进制 SHA256" }
  };

  const PACKAGE_PLATFORMS = {
    "头条（dmp）": { ext: "dmp", eol: "\r\n", note: "每行一个标识、无表头、CRLF 换行 —— 适合巨量引擎 DMP 人群包" },
    "广点通（txt）": { ext: "txt", eol: "\n", note: "每行一个标识、无表头、LF 换行 —— 适合广点通人群包" }
  };

  function downloadTextFile(fileName, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* 手机号等明文不出浏览器：MD5 / SHA256 都在前端本地算（SHA256 纯 JS 实现，file:// 下也能用） */
  function md5Hex(text) {
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const bytes = new TextEncoder().encode(text);
    const bitLen = bytes.length * 8;
    const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, bitLen >>> 0, true);
    view.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i += 1) M[i] = view.getUint32(offset + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i += 1) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const tmp = D;
        D = C;
        C = B;
        const sum = (A + F + K[i] + M[g]) >>> 0;
        B = (B + ((sum << S[i]) | (sum >>> (32 - S[i])))) >>> 0;
        A = tmp;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const wordHex = value => [0, 8, 16, 24].map(shift => ((value >>> shift) & 0xff).toString(16).padStart(2, "0")).join("");
    return wordHex(a0) + wordHex(b0) + wordHex(c0) + wordHex(d0);
  }

  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  function sha256Hex(text) {
    const rotr = (value, bits) => ((value >>> bits) | (value << (32 - bits))) >>> 0;
    const bytes = new TextEncoder().encode(text);
    const bitLen = bytes.length * 8;
    const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
    view.setUint32(padded.length - 4, bitLen >>> 0);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i += 1) {
        const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i += 1) {
        const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
        const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(value => value.toString(16).padStart(8, "0")).join("");
  }

  function hashIdentity(value, encrypt, upper) {
    if (encrypt === "MD5") return upper ? md5Hex(value).toUpperCase() : md5Hex(value);
    if (encrypt === "SHA256") return upper ? sha256Hex(value).toUpperCase() : sha256Hex(value);
    return value;
  }

  /* ===== 业务工具箱 · 工具 A：生成人群包（上传即出包，不写「人群包管理」） ===== */

  const AudiencePackageApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          ${TOOL_META_TEMPLATE("生成人群包", "解析与加密都在浏览器本地完成，手机号等明文不上传；一次性自助生成，不写入「人群包管理」。", "业务工具箱")}
          <div style="padding:14px 20px 20px">
            <div class="portal-vue-tool-section">
              <div class="portal-vue-tool-section-head">1 · 输入标识</div>
              <div class="portal-vue-form-row">
                <div class="form-field" style="width:220px">
                  <label>标识类型</label>
                  <el-select v-model="idType" style="width:100%" @change="resetResult">
                    <el-option v-for="(spec, name) in identitySpecs" :key="name" :label="name" :value="name"></el-option>
                  </el-select>
                  <p class="portal-vue-muted">{{ specHint }}</p>
                </div>
              </div>
              <div class="form-field">
                <label>粘贴标识（每行一个，也支持逗号 / Tab / 分号分隔）</label>
                <el-input v-model="rawText" type="textarea" :rows="6" :disabled="!canEdit('生成人群包')" placeholder="手机号&#10;13800000001&#10;13800000002"></el-input>
              </div>
              <div class="portal-vue-csv-row">
                <el-upload action="#" :auto-upload="false" :show-file-list="false" accept=".csv,.txt" :on-change="handleFile">
                  <template #trigger><el-button v-if="canEdit('生成人群包')">⬆ 上传文件</el-button></template>
                </el-upload>
                <span class="portal-vue-muted">支持 .csv / .txt，单列或含表头多列（自动识别表头与标识列）</span>
                <el-button link type="primary" @click="loadSample">载入示例</el-button>
                <el-button link type="primary" :disabled="!rawText" @click="resetResult">清空</el-button>
              </div>
              <div v-if="columns.length > 1" class="portal-vue-form-row" style="margin-top:12px">
                <div class="form-field" style="width:240px">
                  <label>标识所在列</label>
                  <el-select v-model="columnIndex" style="width:100%">
                    <el-option v-for="(label, index) in columns" :key="index" :label="label" :value="index"></el-option>
                  </el-select>
                </div>
              </div>
              <div class="portal-vue-tool-actions">
                <el-tooltip :disabled="canEdit('生成人群包')" content="需要「生成人群包」的编辑权限，请联系管理员开通" placement="top">
                  <span><el-button type="primary" :disabled="!canEdit('生成人群包') || !rawText.trim()" @click="validate">校验</el-button></span>
                </el-tooltip>
              </div>
            </div>

            <div v-if="report" class="portal-vue-tool-section">
              <div class="portal-vue-tool-section-head">2 · 校验结果</div>
              <div class="portal-vue-kpis">
                <div class="portal-vue-kpi"><span>总行数</span><strong>{{ report.total }}</strong></div>
                <div class="portal-vue-kpi"><span>有效标识</span><strong>{{ report.valid }}</strong></div>
                <div class="portal-vue-kpi"><span>去重后</span><strong>{{ report.unique }}</strong></div>
                <div class="portal-vue-kpi"><span>重复行</span><strong>{{ report.duplicate }}</strong></div>
                <div class="portal-vue-kpi"><span>无效行</span><strong>{{ report.invalid }}</strong></div>
              </div>
              <el-alert v-if="report.unique" type="success" :closable="false" show-icon :title="'校验通过：可生成 ' + report.unique + ' 条标识'" :description="'类型「' + idType + '」；无效行会被剔除，请先确认下方明细。'" style="margin-top:12px" />
              <el-alert v-else type="warning" :closable="false" show-icon title="没有可用标识" description="请检查标识类型是否选错，或回到第 1 步重新粘贴。" style="margin-top:12px" />
              <template v-if="report.invalidSamples.length">
                <div class="portal-vue-section-line" style="margin-top:18px"><h3>无效行（最多展示 20 条）</h3><el-button link type="primary" @click="downloadInvalid">⬇ 下载完整无效清单</el-button></div>
                <el-table :data="report.invalidSamples" class="portal-vue-table" border max-height="260">
                  <el-table-column prop="line" label="行号" width="90"></el-table-column>
                  <el-table-column label="原值" min-width="220"><template #default="scope"><code class="portal-vue-code">{{ scope.row.value || "（空）" }}</code></template></el-table-column>
                  <el-table-column prop="reason" label="原因" min-width="220"></el-table-column>
                </el-table>
              </template>
            </div>

            <div v-if="report" class="portal-vue-tool-section">
              <div class="portal-vue-tool-section-head">3 · 生成与下载</div>
              <div class="portal-vue-form-row">
                <div class="form-field" style="width:220px">
                  <label>输出平台</label>
                  <el-select v-model="platform" style="width:100%" @change="outputText = ''">
                    <el-option v-for="(spec, name) in platforms" :key="name" :label="name" :value="name"></el-option>
                  </el-select>
                </div>
                <div class="form-field">
                  <label>加密方式</label>
                  <div class="cp-radio-row" id="pkgEncrypt">
                    <label><input type="radio" name="pkgenc" value="不加密" v-model="encrypt" @change="outputText = ''" /> 不加密</label>
                    <label><input type="radio" name="pkgenc" value="MD5" v-model="encrypt" @change="outputText = ''" /> MD5</label>
                    <label><input type="radio" name="pkgenc" value="SHA256" v-model="encrypt" @change="outputText = ''" /> SHA256</label>
                  </div>
                </div>
                <div class="form-field">
                  <label>十六进制大小写</label>
                  <div class="cp-radio-row">
                    <label><input type="radio" name="pkgupper" value="lower" v-model="hexCase" @change="outputText = ''" /> 小写</label>
                    <label><input type="radio" name="pkgupper" value="upper" v-model="hexCase" @change="outputText = ''" /> 大写</label>
                  </div>
                </div>
              </div>
              <p class="portal-vue-muted" style="margin:10px 0 0">格式规范：{{ platformNote }}</p>
              <div class="portal-vue-tool-actions">
                <el-tooltip :disabled="canEdit('生成人群包')" content="需要「生成人群包」的编辑权限，请联系管理员开通" placement="top">
                  <span><el-button type="primary" :disabled="!canEdit('生成人群包') || !report.unique" @click="generate">生成人群包</el-button></span>
                </el-tooltip>
                <el-button :disabled="!outputText" @click="downloadPackage">⬇ 下载 {{ outputFileName }}</el-button>
              </div>
              <pre v-if="outputText" class="portal-vue-preview">{{ outputPreview }}</pre>
            </div>

            <div class="portal-vue-tool-section">
              <div class="portal-vue-tool-section-head">生成批次（仅本工具留档，不进「人群包管理」）</div>
              <el-table :data="batches" class="portal-vue-table" border empty-text="还没有生成记录">
                <el-table-column prop="id" label="批次号" width="180"></el-table-column>
                <el-table-column prop="createdAt" label="生成时间" width="150"></el-table-column>
                <el-table-column prop="creator" label="生成人" width="100"></el-table-column>
                <el-table-column prop="idType" label="标识类型" width="120"></el-table-column>
                <el-table-column prop="rows" label="标识数" width="90" align="center"></el-table-column>
                <el-table-column prop="platform" label="平台" width="130"></el-table-column>
                <el-table-column prop="encrypt" label="加密" width="90"></el-table-column>
                <el-table-column prop="fileName" label="文件名" min-width="220"><template #default="scope"><code class="portal-vue-code">{{ scope.row.fileName }}</code></template></el-table-column>
              </el-table>
            </div>
          </div>
        </section>
      </el-config-provider>
    `,
    data: () => ({
      identitySpecs: IDENTITY_SPECS,
      platforms: PACKAGE_PLATFORMS,
      idType: "手机号",
      rawText: "",
      parsed: null,
      columnIndex: 0,
      report: null,
      platform: "头条（dmp）",
      encrypt: "MD5",
      hexCase: "lower",
      outputText: "",
      batches: [
        { id: "PK20260918001", createdAt: "2026-09-18 15:22", creator: "曾祥竞", idType: "手机号", rows: 128340, platform: "头条（dmp）", encrypt: "MD5", fileName: "audience_20260918.dmp" }
      ]
    }),
    computed: {
      specHint() { return (IDENTITY_SPECS[this.idType] || {}).hint || ""; },
      platformNote() { return (PACKAGE_PLATFORMS[this.platform] || {}).note || ""; },
      columns() {
        if (!this.parsed) return [];
        const header = this.parsed.header;
        return Array.from({ length: this.parsed.width }, (_, index) => (header && header[index]) ? `${header[index]}（第 ${index + 1} 列）` : `第 ${index + 1} 列`);
      },
      outputFileName() {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        return `audience_${stamp}.${(PACKAGE_PLATFORMS[this.platform] || {}).ext || "txt"}`;
      },
      outputPreview() {
        if (!this.outputText) return "";
        const lines = this.outputText.split(/\r?\n/);
        return lines.slice(0, 10).join("\n") + (lines.length > 10 ? `\n… 共 ${lines.length} 行` : "");
      }
    },
    methods: {
      resetResult() { this.report = null; this.outputText = ""; this.parsed = null; this.columnIndex = 0; },
      loadSample() {
        this.idType = "手机号";
        this.rawText = "手机号\n13800000001\n13800000002\n13800000003\n13800000002\n1390000000\nabcdefg\n13612345678\n13100000000";
        this.resetResult();
      },
      parse(raw) {
        const lines = String(raw || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const rows = lines.map(line => line.split(/[,\t;]/).map(cell => cell.trim()));
        const width = rows.reduce((max, row) => Math.max(max, row.length), 1);
        const spec = IDENTITY_SPECS[this.idType] || IDENTITY_SPECS["手机号"];
        const looksLikeHeader = rows.length > 1 && rows[0].some(cell => cell && !spec.pattern.test(cell));
        return { header: looksLikeHeader ? rows[0] : null, rows: looksLikeHeader ? rows.slice(1) : rows, width };
      },
      handleFile(file) {
        const raw = (file && file.raw) || file;
        if (!raw || typeof FileReader === "undefined") return ep.ElMessage.warning("当前浏览器不支持文件读取");
        const reader = new FileReader();
        reader.onload = () => {
          this.rawText = String(reader.result || "");
          this.resetResult();
          const parsed = this.parse(this.rawText);
          this.parsed = parsed;
          ep.ElMessage.success(`已读取 ${parsed.rows.length} 行，识别到 ${parsed.width} 列`);
        };
        reader.onerror = () => ep.ElMessage.warning("文件读取失败，请重试");
        reader.readAsText(raw);
      },
      validate() {
        const spec = IDENTITY_SPECS[this.idType] || IDENTITY_SPECS["手机号"];
        const parsed = this.parse(this.rawText);
        this.parsed = parsed;
        const index = Math.min(this.columnIndex, parsed.width - 1);
        const seen = new Map();
        const invalidSamples = [];
        const valid = [];
        let duplicate = 0;
        let invalid = 0;
        parsed.rows.forEach((row, rowIndex) => {
          const value = (row[index] || "").trim();
          const line = rowIndex + (parsed.header ? 2 : 1);
          if (!value) { invalid += 1; if (invalidSamples.length < 20) invalidSamples.push({ line, value: "", reason: "空值" }); return; }
          if (!spec.pattern.test(value)) { invalid += 1; if (invalidSamples.length < 20) invalidSamples.push({ line, value, reason: `不符合「${this.idType}」格式（${spec.hint}）` }); return; }
          const key = value.toLowerCase();
          if (seen.has(key)) { duplicate += 1; return; }
          seen.set(key, true);
          valid.push(value);
        });
        this.report = { total: parsed.rows.length, valid: valid.length + duplicate, unique: valid.length, duplicate, invalid, invalidSamples, values: valid };
        this.outputText = "";
        if (!parsed.rows.length) ep.ElMessage.warning("没有解析到任何数据行");
        else ep.ElMessage.success(`校验完成：${valid.length} 条可用、${duplicate} 条重复、${invalid} 条无效`);
      },
      generate() {
        if (!canEditMenu("生成人群包")) return denyEdit();
        if (!this.report || !this.report.unique) return ep.ElMessage.warning("请先完成校验");
        const spec = PACKAGE_PLATFORMS[this.platform] || PACKAGE_PLATFORMS["头条（dmp）"];
        const upper = this.hexCase === "upper";
        const rows = this.report.values.map(value => hashIdentity(value, this.encrypt, upper));
        this.outputText = rows.join(spec.eol) + spec.eol;
        const stamp = new Date();
        const pad = value => String(value).padStart(2, "0");
        const id = `PK${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${String(this.batches.length + 1).padStart(3, "0")}`;
        this.batches.unshift({
          id,
          createdAt: `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`,
          creator: "曾祥竞",
          idType: this.idType,
          rows: this.report.unique,
          platform: this.platform,
          encrypt: this.encrypt === "不加密" ? "不加密" : `${this.encrypt}${upper ? "（大写）" : ""}`,
          fileName: this.outputFileName
        });
        ep.ElMessage.success(`已生成 ${this.report.unique} 条标识（${this.platform} · ${this.encrypt}）`);
      },
      downloadPackage() {
        if (!canEditMenu("生成人群包")) return denyEdit();
        if (!this.outputText) return ep.ElMessage.warning("请先生成人群包");
        downloadTextFile(this.outputFileName, this.outputText);
        ep.ElMessage.success(`已下载 ${this.outputFileName}`);
      },
      downloadInvalid() {
        if (!canEditMenu("生成人群包")) return denyEdit();
        if (!this.report || !this.report.invalidSamples.length) return ep.ElMessage.warning("没有无效行需要导出");
        const csv = ["行号,原值,原因"].concat(this.report.invalidSamples.map(item => [item.line, item.value, item.reason].join(","))).join("\n");
        downloadTextFile("无效标识清单.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
      }
    }
  };
  mount("#audiencePackageView", AudiencePackageApp, "audience-package");
})();

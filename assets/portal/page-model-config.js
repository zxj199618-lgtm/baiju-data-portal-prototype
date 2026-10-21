/**
 * 页面：model-config
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    MODEL_REASONING_CHOICES,
    analysisGatewayBase,
    confirmAction,
    ep,
    mount,
    notify
  } = window.PortalVue;


  /* 模型配置 → 供应商接入：字段与交互参考 CC Switch / DeepSeek Harness 的 provider 配置
     （预设模板带出端点与鉴权、Key 只写不读、连通性语义化、模型能力挂在模型上） */
  const MODEL_PROVIDER_PRESETS = [
    { id: "deepseek", label: "DeepSeek 官方", protocol: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", authType: "bearer", models: ["deepseek-chat", "deepseek-reasoner"], note: "OpenAI 兼容端点 + Bearer Token" },
    { id: "kimi", label: "月之暗面 Kimi", protocol: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", authType: "bearer", models: ["kimi-k2-0905-preview"], note: "OpenAI 兼容端点 + Bearer Token" },
    { id: "glm", label: "智谱 GLM", protocol: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", authType: "bearer", models: ["glm-4.6"], note: "OpenAI 兼容端点 + Bearer Token" },
    { id: "qwen", label: "阿里百炼 Qwen", protocol: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", authType: "bearer", models: ["qwen3-max"], note: "兼容模式端点 + Bearer Token" },
    { id: "ark", label: "火山方舟 ARK", protocol: "openai-compatible", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", authType: "bearer", models: [], note: "OpenAI 兼容端点；模型填接入点 ID（ep-xxxxxxxx）或模型名" },
    { id: "openai", label: "OpenAI 官方", protocol: "openai-compatible", baseUrl: "https://api.openai.com/v1", authType: "bearer", models: ["gpt-4o-mini"], note: "OpenAI 兼容端点 + Bearer Token" },
    { id: "ollama", label: "本地 Ollama / vLLM", protocol: "openai-compatible", baseUrl: "http://127.0.0.1:11434/v1", authType: "bearer", models: [], note: "本地服务通常不校验 Key，可留空" },
    { id: "anthropic", label: "Anthropic 原生", protocol: "anthropic", baseUrl: "https://api.anthropic.com", authType: "x-api-key", models: ["claude-sonnet-4-5"], note: "x-api-key 头 + anthropic-version；走 /v1/messages，可直接在灵犀智析里用" },
    { id: "custom", label: "自定义（OpenAI 兼容）", protocol: "openai-compatible", baseUrl: "", authType: "bearer", models: [], note: "手填 Base URL 与模型 ID，鉴权默认 Bearer" }
  ];
  /** 协议下拉只暴露实际会用到的两类；其余历史取值（ARK/Azure/Gemini 等）仍可编辑但不新选 */
  const MODEL_PROTOCOL_OPTIONS = ["openai-compatible", "anthropic"];
  const MODEL_PROTOCOL_FALLBACK = [
    { id: "openai-compatible", label: "OpenAI 兼容", callable: true },
    { id: "ark", label: "火山方舟 ARK", callable: true },
    { id: "custom", label: "自定义兼容端点", callable: true },
    { id: "azure-openai", label: "Azure OpenAI", callable: true },
    { id: "anthropic", label: "Anthropic 原生", callable: false },
    { id: "anthropic-compatible", label: "Anthropic 兼容中转", callable: false },
    { id: "gemini", label: "Google Gemini", callable: false }
  ];
  const MODEL_AUTH_LABELS = { bearer: "Bearer Token", "x-api-key": "x-api-key 头", "x-goog-api-key": "x-goog-api-key 头", "api-key-header": "api-key 头", query: "URL 查询参数", "custom-header": "自定义 Header" };
  const MODEL_AUTH_KEY_DEFAULTS = { "x-api-key": "x-api-key", "x-goog-api-key": "x-goog-api-key", "api-key-header": "api-key", query: "key", "custom-header": "X-Api-Key" };
  /* 模型能力：上下文上限 + 思考深度档位。跟网关的 REASONING_LEVELS / MODEL_REASONING_RULES 对齐，
     配置页按模型覆盖，没配置的用网关推断值（行里标「推断」）。 */
  const MODEL_CONTEXT_CHOICES = [
    { value: 32000, label: "32K" },
    { value: 64000, label: "64K" },
    { value: 128000, label: "128K" },
    { value: 200000, label: "200K" },
    { value: 256000, label: "256K" },
    { value: 400000, label: "400K" },
    { value: 1000000, label: "1M" }
  ];
  const MODEL_REASONING_LABELS = MODEL_REASONING_CHOICES.reduce((map, item) => Object.assign(map, { [item.value]: item.label }), {});

  const ModelConfigApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left">
              <el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索模型或供应商"></el-input>
              <el-select v-model="statusFilter" class="portal-vue-filter" style="width:132px">
                <el-option label="全部模型" value="all"></el-option>
                <el-option label="仅可用" value="enabled"></el-option>
                <el-option label="仅禁用" value="disabled"></el-option>
              </el-select>
            </div>
            <div>
              <el-button :loading="loading" @click="load">刷新</el-button>
              <el-button v-if="canEdit('模型配置')" type="primary" @click="openProviderDrawer">供应商配置</el-button>
            </div>
          </div>
          <el-alert v-if="notice" class="portal-vue-provider-alert" type="warning" :closable="false" show-icon :title="notice"></el-alert>

          <div class="portal-vue-block-head"><strong>全部可用模型</strong><span class="portal-vue-muted">共 {{ modelRows.length }} 个模型，来自 {{ enabledProviders.length }} 个启用中的供应商；开关即改即生效，供应商一停用它的模型立即从这里和灵犀智析下拉框一起消失</span></div>
          <el-table :data="filteredRows" class="portal-vue-table" border :empty-text="emptyText">
            <el-table-column prop="id" label="模型" min-width="240"><template #default="scope"><code class="portal-vue-code">{{ scope.row.id }}</code></template></el-table-column>
            <el-table-column label="供应商" min-width="210">
              <template #default="scope">
                <el-tag size="small" :type="scope.row.builtin ? 'info' : 'primary'" effect="plain">{{ scope.row.source }}</el-tag>
                <el-tooltip v-if="scope.row.sources.length > 1" :content="'同模型还来自：' + scope.row.sources.slice(1).join('、')" placement="top"><el-tag size="small" effect="plain" style="margin-left:4px">+{{ scope.row.sources.length - 1 }}</el-tag></el-tooltip>
                <el-tag v-if="scope.row.adaptable === false" size="small" type="warning" effect="light" style="margin-left:4px">协议待适配</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="协议" width="150"><template #default="scope">{{ scope.row.protocolLabel }}</template></el-table-column>
            <el-table-column label="状态" width="110"><template #default="scope"><el-tag :type="scope.row.enabled ? 'success' : 'info'" effect="light">{{ scope.row.enabled ? "可用" : "已禁用" }}</el-tag></template></el-table-column>
            <el-table-column label="上下文" width="120"><template #default="scope"><span>{{ contextLabel(scope.row.contextLimit) }}</span><el-tag v-if="scope.row.capabilityConfigured" size="small" type="success" effect="plain" style="margin-left:6px">已配</el-tag><el-tag v-else size="small" type="info" effect="plain" style="margin-left:6px">推断</el-tag></template></el-table-column>
            <el-table-column label="思考深度" min-width="180"><template #default="scope"><span v-if="scope.row.reasoning && scope.row.reasoning.levels.length">{{ reasoningText(scope.row.reasoning) }}</span><span v-else class="portal-vue-muted">不支持</span></template></el-table-column>
            <el-table-column label="禁用时间" width="180"><template #default="scope">{{ scope.row.disabledAt ? scope.row.disabledAt.slice(0, 16).replace("T", " ") : "—" }}</template></el-table-column>
            <el-table-column label="操作" width="190" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button link type="primary" :disabled="!canEdit('模型配置')" @click="openCapability(scope.row)">能力</el-button><el-switch :disabled="!canEdit('模型配置')" :model-value="scope.row.enabled" inline-prompt active-text="启用" inactive-text="禁用" @change="value=>toggleModel(scope.row, value)"></el-switch></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">模型按「供应商优先」路由：同名模型按供应商列表顺序取第一个；供应商（含内置中转站）统一在「供应商配置」里维护，随改随生效。「上下文」与「思考深度」是每个模型的可用能力，点行内「能力」按模型调；灵犀智析只让用户选该模型声明支持的思考档位。</div>
        </section>

        <el-dialog v-model="capabilityVisible" :title="'模型能力 · ' + (capabilityModel?.id || '')" width="560px">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="上下文上限">
              <el-select v-model="capabilityForm.contextLimit" filterable allow-create default-first-option style="width:100%">
                <el-option v-for="item in contextOptions" :key="item.value" :label="item.label" :value="item.value"></el-option>
              </el-select>
              <span class="portal-vue-muted" style="font-size:12px">灵犀智析按这个上限自动装填证据，不给用户摆 token 滑杆；正常按厂商公开规格填即可</span>
            </el-form-item>
            <el-form-item label="支持的思考深度">
              <el-checkbox-group v-model="capabilityForm.levels">
                <el-checkbox v-for="item in reasoningChoices" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
              </el-checkbox-group>
              <span class="portal-vue-muted" style="font-size:12px">一个都不勾 = 不支持思考，灵犀智析输入框里不会出现「深度」这一项</span>
            </el-form-item>
            <el-form-item label="默认档位">
              <el-select v-model="capabilityForm.default" :disabled="!capabilityForm.levels.length" style="width:100%">
                <el-option v-for="item in reasoningChoices.filter(entry => capabilityForm.levels.includes(entry.value))" :key="item.value" :label="item.label" :value="item.value"></el-option>
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="capabilityVisible=false">取消</el-button><el-button type="primary" :loading="capabilitySaving" :disabled="!canEdit('模型配置')" @click="saveCapability">保存</el-button></div>
          </template>
        </el-dialog>

        <el-drawer v-model="providerDrawer" :title="viewMode === 'form' ? (editingId ? '编辑供应商 · ' + form.name : '接入供应商') : '供应商配置'" :size="viewMode === 'form' ? '620px' : 'min(1260px, 96vw)'" direction="rtl" class="portal-vue-edit-drawer" :close-on-click-modal="true">
          <div v-if="viewMode === 'list'" class="portal-vue-provider-list">
            <div class="portal-vue-provider-list-bar">
              <span class="portal-vue-muted">所有模型来源都在这里维护：内置中转站由环境变量 RELAY_BASE_URL / RELAY_API_KEY 首次迁移而来，之后可直接改 Base URL、Key 与模型</span>
              <el-button v-if="canEdit('模型配置')" type="primary" size="small" @click="openProvider(null)">＋ 接入供应商</el-button>
            </div>
            <el-table :data="providers" class="portal-vue-table" border empty-text="还没有供应商，点「接入供应商」添加">
              <el-table-column label="供应商" min-width="170">
                <template #default="scope">
                  <div><span class="portal-vue-name">{{ scope.row.name }}</span><el-tag v-if="scope.row.builtin" size="small" type="info" effect="plain" style="margin-left:6px">内置</el-tag></div>
                  <div class="portal-vue-muted" style="margin-top:2px">{{ scope.row.protocolLabel }}<span v-if="scope.row.note"> · {{ scope.row.note }}</span></div>
                </template>
              </el-table-column>
              <el-table-column label="Base URL" min-width="168"><template #default="scope"><code class="portal-vue-code">{{ scope.row.baseUrl }}</code></template></el-table-column>
              <el-table-column label="Key 类型" width="106"><template #default="scope">{{ authLabel(scope.row.authType) }}</template></el-table-column>
              <el-table-column label="API Key" width="150">
                <template #default="scope">
                  <span v-if="scope.row.hasKey" class="portal-vue-key-state ok"><i></i>{{ scope.row.keyMasked }}<em v-if="scope.row.keyCount > 1">等 {{ scope.row.keyCount }} 个 Key</em></span>
                  <span v-else class="portal-vue-key-state miss"><i></i>{{ scope.row.callable ? "未配置" : "无需 Key" }}</span>
                </template>
              </el-table-column>
              <el-table-column label="模型" width="58" align="right"><template #default="scope">{{ scope.row.models.length }}</template></el-table-column>
              <el-table-column label="连通性" width="98">
                <template #default="scope">
                  <el-tooltip v-if="scope.row.health" :content="scope.row.health.message + '（' + healthTime(scope.row.health.at) + '）'" placement="top">
                    <el-tag size="small" :type="scope.row.health.ok ? 'success' : 'danger'" effect="light">{{ scope.row.health.ok ? "正常" : "异常" }}</el-tag>
                  </el-tooltip>
                  <span v-else class="portal-vue-muted">未测试</span>
                </template>
              </el-table-column>
              <el-table-column label="启用" width="76"><template #default="scope"><el-switch :disabled="!canEdit('模型配置')" :model-value="scope.row.enabled !== false" inline-prompt active-text="启用" inactive-text="停用" @change="value=>toggleProvider(scope.row, value)"></el-switch></template></el-table-column>
              <el-table-column label="操作" width="230" fixed="right">
                <template #default="scope">
                  <el-button link type="primary" :disabled="!canEdit('模型配置')" @click="rowTest(scope.row)" title="测试连通性">测试</el-button>
                  <el-button link type="primary" :disabled="!canEdit('模型配置')" @click="rowRefresh(scope.row)" title="按当前 Key 重新拉取模型列表">拉取</el-button>
                  <el-button v-if="scope.row.keyCount > 1" link type="primary" :disabled="!canEdit('模型配置')" @click="openSplit(scope.row)" title="把这个供应商按 Key 拆成多条">拆分</el-button>
                  <el-button link type="primary" :disabled="!canEdit('模型配置')" @click="openProvider(scope.row)" title="编辑 Base URL / Key / 模型">编辑</el-button>
                  <el-button link type="danger" :disabled="!canEdit('模型配置')" @click="removeProvider(scope.row)" title="删除这条供应商">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <el-form v-else class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="预设模板">
              <el-select v-model="presetId" placeholder="选常见供应商，自动带出 Base URL 与模型" @change="applyPreset">
                <el-option v-for="item in presets" :key="item.id" :label="item.label" :value="item.id"></el-option>
              </el-select>
              <span v-if="presetNote" class="portal-vue-muted" style="font-size:12px">{{ presetNote }}</span>
            </el-form-item>
            <el-form-item label="供应商名称" required><el-input v-model="form.name" placeholder="如：DeepSeek 官方"></el-input></el-form-item>
            <el-form-item label="协议类型" required>
              <el-select v-model="form.protocol" @change="onProtocolChange">
                <el-option v-for="item in protocolOptions" :key="item.id" :label="item.label + (item.callable ? '' : '（协议待适配）')" :value="item.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="Base URL" required><el-input v-model="form.baseUrl" placeholder="如：https://api.deepseek.com/v1"></el-input></el-form-item>
            <el-form-item label="API Key" required>
              <el-input v-model="keysText" autocomplete="new-password" :placeholder="keyPlaceholder"></el-input>
              <div class="portal-vue-provider-hints">
                <span>{{ keyHint }}</span>
                <span>按「{{ form.protocol ? protocolLabelOf(form.protocol) : "OpenAI 兼容" }}」自动用 {{ authLabel(form.authType) }} 发送，无需选择</span>
                <span v-if="form.keyCount > 1">当前记录里存了 {{ form.keyCount }} 个 Key（历史数据）：可到列表里用「拆分 Key」拆成多条，或直接粘贴一个新 Key 覆盖</span>
              </div>
            </el-form-item>
            <el-form-item v-if="form.protocol === 'azure-openai'" label="api-version" required><el-input v-model="form.apiVersion" placeholder="如：2024-10-21"></el-input></el-form-item>
            <el-form-item label="模型 ID" required>
              <el-input v-model="modelsText" type="textarea" :rows="4" resize="none" placeholder="每行或逗号分隔，如：deepseek-chat, deepseek-reasoner"></el-input>
              <div class="portal-vue-provider-actions">
                <el-button size="small" :loading="testing" @click="testForm(false)">测试连通性</el-button>
                <el-button size="small" :loading="testing" @click="testForm(true)">拉取模型列表</el-button>
                <span v-if="testResult" class="portal-vue-provider-test-result" :class="testOk ? 'ok' : 'bad'">{{ testResult }}</span>
              </div>
            </el-form-item>
            <el-form-item label="备注"><el-input v-model="form.note" placeholder="如：给归因分析用的备用通道"></el-input></el-form-item>
            <el-form-item label="启用"><el-switch v-model="form.enabled" inline-prompt active-text="启用" inactive-text="停用" active-color="#16a34a"></el-switch><span class="portal-vue-muted" style="margin-left:10px;font-size:12px">停用后该供应商的模型立即从灵犀智析隐藏</span></el-form-item>
            <el-form-item v-if="editingId && form.hasKey" label="已保存的 Key"><el-button size="small" @click="clearKeys">清除已保存的 Key</el-button></el-form-item>
          </el-form>

          <template #footer>
            <div v-if="viewMode === 'list'" style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="providerDrawer=false">关闭</el-button></div>
            <div v-else style="display:flex;justify-content:flex-end;gap:10px">
              <el-button @click="backToList">返回列表</el-button>
              <el-button type="primary" :loading="saving" :disabled="!canEdit('模型配置')" @click="saveProvider">保存</el-button>
            </div>
          </template>
        </el-drawer>

        <el-dialog v-model="splitVisible" :title="'拆分 Key · ' + (splitSource?.name || '')" width="560px">
          <el-alert type="info" :closable="false" show-icon title="每个 Key 拆成一条独立的供应商记录：各自拉取自己的模型清单与连通性，也就能分别命名与停用。模型开关按模型名保留，不会因为拆分而改变。"></el-alert>
          <div class="portal-vue-split-list">
            <div v-for="(item, index) in splitForm" :key="index" class="portal-vue-split-row">
              <span class="portal-vue-key-state ok"><i></i>{{ item.masked }}</span>
              <el-input v-model="item.name" placeholder="给这条供应商起个名字"></el-input>
            </div>
          </div>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="splitVisible=false">取消</el-button><el-button type="primary" :loading="splitting" :disabled="!canEdit('模型配置')" @click="confirmSplit">确认拆分</el-button></div>
          </template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({rows:[],providers:[],hiddenProviders:[],protocols:MODEL_PROTOCOL_FALLBACK,notice:"",keyword:"",statusFilter:"all",loading:false,providerDrawer:false,viewMode:"list",editingId:"",saving:false,testing:false,testResult:"",testOk:null,presetId:"deepseek",presets:MODEL_PROVIDER_PRESETS,modelsText:"",keysText:"",form:{},splitVisible:false,splitSource:null,splitForm:[],splitting:false,capabilityVisible:false,capabilityModel:null,capabilitySaving:false,capabilityForm:{contextLimit:128000,levels:[],default:""},contextOptions:MODEL_CONTEXT_CHOICES,reasoningChoices:MODEL_REASONING_CHOICES}),
    computed:{
      /** 停用供应商的模型不进 rows（网关已过滤）：可用清单只统计启用中的供应商 */
      enabledProviders(){return this.providers.filter(item=>item.enabled!==false);},
      hiddenModelCount(){return this.hiddenProviders.reduce((sum,item)=>sum+(item.count||0),0);},
      emptyText(){
        const names=this.hiddenProviders.map(item=>item.name).join("、");
        if(names)return `${names}已停用，其 ${this.hiddenModelCount} 个模型已隐藏：到右上角「供应商配置」重新启用即恢复`;
        if(!this.providers.length)return "还没有可用模型：点右上角「供应商配置」接入";
        if(this.keyword.trim()||this.statusFilter!=="all")return "没有符合当前搜索 / 筛选条件的模型";
        return "还没有可用模型：供应商的模型清单为空，去「供应商配置」点「拉取模型」同步";
      },
      modelRows(){
        // 一个模型一行：同 id 的其它供应商收进 sources（路由按供应商列表顺序取第一个）
        const map=new Map();
        this.rows.forEach(row=>{
          const existing=map.get(row.id);
          if(existing){existing.sources.push(row.source);}
          else map.set(row.id,Object.assign({},row,{sources:[row.source]}));
        });
        return [...map.values()];
      },
      filteredRows(){
        const keyword=this.keyword.trim().toLowerCase();
        return this.modelRows.filter(item=>{
          if(this.statusFilter==="enabled"&&!item.enabled)return false;
          if(this.statusFilter==="disabled"&&item.enabled)return false;
          return !keyword||item.id.toLowerCase().includes(keyword)||String(item.source||"").toLowerCase().includes(keyword);
        });
      },
      protocolOptions(){
        const main=this.protocols.filter(item=>MODEL_PROTOCOL_OPTIONS.includes(item.id));
        const current=this.form&&this.form.protocol;
        if(current&&!MODEL_PROTOCOL_OPTIONS.includes(current)){
          const found=this.protocols.find(item=>item.id===current);
          return [...main,{id:current,label:(found?found.label:current)+"（沿用当前配置）",callable:Boolean(found&&found.callable)}];
        }
        return main;
      },
      parsedModels(){return this.modelsText.split(/[\n,，;；]/).map(item=>item.trim()).filter(Boolean);},
      /** 一个供应商只配一个 Key：粘贴多行时只取第一个，避免误把多个厂商的 Key 塞进一条 */
      parsedKeys(){const first=this.keysText.split(/[\n,;；]/).map(item=>item.trim()).filter(Boolean)[0];return first?[first]:[];},
      presetNote(){const preset=this.presets.find(item=>item.id===this.presetId);return preset?preset.note:"";},
      keyPlaceholder(){return this.form.hasKey?"已保存 "+this.form.keyMasked+(this.form.keyCount>1?"（共 "+this.form.keyCount+" 个）":"")+"，留空表示不修改":"粘贴 API Key；多个 Key 每行一个，轮换重试";},
      keyHint(){return this.form.hasKey?"已保存的 Key 只写不读，页面不回显明文；留空表示不修改，要更换就直接粘贴新 Key":"必填：Key 只写入网关数据卷（0600），页面不回显明文；本地地址（localhost / 127.0.0.1）可不填，只需一个 Key"}
    },
    mounted(){this.pageHandler=event=>{if(event.detail?.page==="模型配置")this.load();};window.addEventListener("portal:page-change",this.pageHandler);this.load();},
    beforeUnmount(){window.removeEventListener("portal:page-change",this.pageHandler);},
    methods:{
      authLabel(value){return MODEL_AUTH_LABELS[value]||value||"Bearer Token";},
      healthTime(value){return value?String(value).slice(0,16).replace("T"," "):"—";},
      async load(){
        this.loading=true;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/model-config`);
          if(response.ok){
            const data=await response.json();
            this.rows=data.models||[];
            this.providers=data.providers||[];
            this.hiddenProviders=Array.isArray(data.hiddenProviders)?data.hiddenProviders:[];
            if(Array.isArray(data.protocols)&&data.protocols.length)this.protocols=data.protocols;
            this.notice=data.notice||"";
          }
        }catch(error){this.rows=[];this.providers=[];this.hiddenProviders=[];this.notice="";}
        this.loading=false;
      },
      openProviderDrawer(){this.viewMode="list";this.providerDrawer=true;this.load();},
      backToList(){this.viewMode="list";this.load();},
      openProvider(row){
        this.testResult="";this.testOk=null;this.keysText="";
        if(row){
          this.editingId=row.id;
          this.presetId="";
          this.form={name:row.name,protocol:row.protocol,baseUrl:row.baseUrl,authType:row.authType||"bearer",authKeyName:row.authKeyName||"",apiVersion:row.apiVersion||"",note:row.note||"",enabled:row.enabled!==false,hasKey:row.hasKey,keyMasked:row.keyMasked,keyCount:row.keyCount||0};
          this.modelsText=(row.models||[]).join("\n");
        }else{
          this.editingId="";
          this.form={name:"",protocol:"openai-compatible",baseUrl:"",authType:"bearer",authKeyName:"",apiVersion:"",note:"",enabled:true,hasKey:false,keyMasked:"",keyCount:0};
          this.modelsText="";
          this.applyPreset("deepseek");
        }
        this.viewMode="form";
      },
      applyPreset(id){
        const preset=this.presets.find(item=>item.id===(id||this.presetId));
        if(!preset)return;
        this.presetId=preset.id;
        const authType=preset.authType||this.defaultAuthFor(preset.protocol);
        this.form=Object.assign({},this.form,{
          name:this.editingId?this.form.name||preset.label:preset.label,
          protocol:preset.protocol,baseUrl:preset.baseUrl,authType,
          authKeyName:MODEL_AUTH_KEY_DEFAULTS[authType]||"",note:preset.note
        });
        this.modelsText=(preset.models||[]).join("\n");
      },
      /** 本地/内网地址通常不校验 Key（Ollama、vLLM、内网网关） */
      isLocalBaseUrl(url){return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w.-]+\.local)([:/]|$)/i.test(String(url||"").trim());},
      protocolLabelOf(id){const item=this.protocols.find(entry=>entry.id===id);return item?item.label:id;},
      /** 鉴权方式按协议自动推断：用户不用选，也不提供覆盖入口 */
      defaultAuthFor(protocol){return protocol==="anthropic"||protocol==="anthropic-compatible"?"x-api-key":protocol==="gemini"?"x-goog-api-key":protocol==="azure-openai"?"api-key-header":"bearer";},
      onProtocolChange(protocol){const next=this.defaultAuthFor(protocol);this.form.authType=next;this.form.authKeyName=MODEL_AUTH_KEY_DEFAULTS[next]||"";},
      async testForm(pullModels){
        if(!this.form.baseUrl||!this.form.baseUrl.trim())return ep.ElMessage.warning("先填 Base URL");
        if(!this.parsedKeys.length&&!this.form.hasKey&&!this.isLocalBaseUrl(this.form.baseUrl))return ep.ElMessage.warning("请先填 API Key 再测试连通性");
        this.testing=true;this.testResult="";this.testOk=null;
        try{
          const payload=Object.assign({},this.form,{id:this.editingId||undefined,apiKeys:this.parsedKeys});
          if(!payload.apiKeys.length)delete payload.apiKeys;
          delete payload.hasKey;delete payload.keyMasked;delete payload.keyCount;
          const response=await fetch(`${analysisGatewayBase}/v1/providers/test`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
          const data=await response.json().catch(()=>({}));
          this.testOk=Boolean(data.ok);
          this.testResult=data.message||data.error||"测试失败";
          if(data.ok&&data.models&&data.models.length){
            if(pullModels||!this.parsedModels.length){this.modelsText=data.models.join("\n");this.testResult="已拉取 "+data.models.length+" 个模型，确认后点保存";}
          }
          if(!data.ok)ep.ElMessage.error(this.testResult);
        }catch(error){this.testOk=false;this.testResult="网络错误：无法连接分析网关";}
        this.testing=false;
      },
      async saveProvider(){
        if(!this.form.name||!this.form.name.trim())return ep.ElMessage.warning("请填写供应商名称");
        if(!this.form.baseUrl||!this.form.baseUrl.trim())return ep.ElMessage.warning("请填写 Base URL");
        const models=this.parsedModels;
        if(!models.length)return ep.ElMessage.warning("至少填一个模型 ID，可先点「拉取模型列表」");
        const savedKey=this.form.hasKey===true&&this.form.clearKeys!==true;
        if(!this.parsedKeys.length&&!savedKey&&!this.isLocalBaseUrl(this.form.baseUrl))return ep.ElMessage.warning("请填写 API Key（本地地址可不填）");
        this.saving=true;
        try{
          const payload=Object.assign({},this.form,{models});
          delete payload.hasKey;delete payload.keyMasked;delete payload.keyCount;
          const keys=this.parsedKeys;
          if(keys.length)payload.apiKeys=keys;else delete payload.apiKeys;
          payload.clearKeys=this.form.clearKeys===true&&!keys.length;
          const url=this.editingId?`${analysisGatewayBase}/v1/providers/${encodeURIComponent(this.editingId)}`:`${analysisGatewayBase}/v1/providers`;
          const response=await fetch(url,{method:this.editingId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
          const data=await response.json().catch(()=>({}));
          if(!response.ok)return ep.ElMessage.error(data.error||"保存失败，请确认网关已启动");
          notify(this.editingId?`供应商「${payload.name}」已更新`:`供应商「${payload.name}」已接入，模型清单已刷新`);
          this.viewMode="list";
          await this.load();
        }catch(error){ep.ElMessage.error("保存失败，请确认网关已启动");}
        this.saving=false;
      },
      clearKeys(){this.keysText="";this.form.hasKey=false;this.form.keyMasked="";this.form.keyCount=0;this.form.clearKeys=true;ep.ElMessage.info("保存后清除网关里已存的 Key");},
      async toggleProvider(row,value){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/providers/${encodeURIComponent(row.id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:value})});
          if(!response.ok){const data=await response.json().catch(()=>({}));return ep.ElMessage.error(data.error||"保存失败，请确认网关已启动");}
          notify(`供应商「${row.name}」已${value?"启用":"停用"}，模型清单已刷新`);
          await this.load();
        }catch(error){ep.ElMessage.error("保存失败，请确认网关已启动");}
      },
      async rowTest(row){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/providers/test`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id})});
          const data=await response.json().catch(()=>({}));
          if(data.ok)ep.ElMessage.success(`${row.name}：${data.message}`);
          else ep.ElMessage.error(`${row.name}：${data.message||"测试失败"}`);
          await this.load();
        }catch(error){ep.ElMessage.error("网络错误：无法连接分析网关");}
      },
      async rowRefresh(row){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/providers/${encodeURIComponent(row.id)}/refresh`,{method:"POST"});
          const data=await response.json().catch(()=>({}));
          if(data.ok&&data.count)notify(`已从「${row.name}」拉取 ${data.count} 个模型`);
          else ep.ElMessage.error(`拉取失败：${data.message||"未知原因"}`);
          await this.load();
        }catch(error){ep.ElMessage.error("网络错误：无法连接分析网关");}
      },
      openSplit(row){
        this.splitSource=row;
        this.splitForm=(row.keyMasks||[]).map((masked,index)=>({masked,name:row.name+(row.keyMasks.length>1?" · "+(index+1):"")}));
        this.splitVisible=true;
      },
      async confirmSplit(){
        if(!this.splitSource)return;
        this.splitting=true;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/providers/${encodeURIComponent(this.splitSource.id)}/split`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({names:this.splitForm.map(item=>item.name)})});
          const data=await response.json().catch(()=>({}));
          if(!response.ok)return ep.ElMessage.error(data.error||"拆分失败");
          this.splitVisible=false;
          notify(`已拆成 ${data.split} 条供应商：${(data.providers||[]).map(item=>item.name).join("、")}`);
          await this.load();
        }catch(error){ep.ElMessage.error("拆分失败，请确认网关已启动");}
        this.splitting=false;
      },
      async removeProvider(row){
        if(!(await confirmAction("删除供应商",`删除后「${row.name}」下 ${row.models.length} 个模型会从模型清单移除，确认删除？`,"删除")))return;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/providers/${encodeURIComponent(row.id)}`,{method:"DELETE"});
          if(!response.ok){const data=await response.json().catch(()=>({}));return ep.ElMessage.error(data.error||"删除失败");}
          notify(`供应商「${row.name}」已删除`);
          await this.load();
        }catch(error){ep.ElMessage.error("删除失败，请确认网关已启动");}
      },
      async toggleModel(row,value){
        await this.putConfig(row.id,{enabled:value});
        row.enabled=value;
        row.disabledAt=value?"":new Date().toISOString();
        notify(`模型「${row.id}」已${value?"启用":"禁用"}`);
      },
      /** 上下文上限：按 K 展示，满 100 万用 M */
      contextLabel(limit){
        const value=Number(limit)||0;
        if(!value)return "—";
        if(value>=1000000)return (value/1000000).toFixed(value%1000000?1:0)+"M";
        return Math.round(value/1000)+"K";
      },
      reasoningText(reasoning){
        const levels=(reasoning&&reasoning.levels)||[];
        if(!levels.length)return "不支持";
        return levels.map(level=>MODEL_REASONING_LABELS[level]||level).join(" / ")+(reasoning.default?`　默认${MODEL_REASONING_LABELS[reasoning.default]||reasoning.default}`:"");
      },
      openCapability(row){
        this.capabilityModel=row;
        const levels=[...((row.reasoning&&row.reasoning.levels)||[])];
        this.capabilityForm={contextLimit:row.contextLimit||128000,levels,default:(row.reasoning&&row.reasoning.default)||levels[levels.length-1]||""};
        this.capabilityVisible=true;
      },
      /** 按模型写回上下文上限 + 思考档位：存 model-config.json，灵犀智析按它渲染「深度」选项 */
      async saveCapability(){
        const row=this.capabilityModel;
        if(!row)return;
        const form=this.capabilityForm;
        const levels=MODEL_REASONING_CHOICES.map(item=>item.value).filter(level=>form.levels.includes(level));
        const contextLimit=Number(form.contextLimit);
        if(!Number.isFinite(contextLimit)||contextLimit<1024)return ep.ElMessage.warning("上下文上限请填不小于 1024 的数字（如 128000）");
        this.capabilitySaving=true;
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/model-config/${encodeURIComponent(row.id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({contextLimit,reasoning:{levels,default:levels.includes(form.default)?form.default:(levels[levels.length-1]||"")}})});
          const data=await response.json().catch(()=>({}));
          if(!response.ok){ep.ElMessage.error(data.error||"保存失败，请确认网关已启动");return;}
          row.contextLimit=data.contextLimit;
          row.reasoning=data.reasoning;
          row.capabilityConfigured=true;
          this.capabilityVisible=false;
          const names=(data.reasoning?.levels||[]).map(level=>MODEL_REASONING_LABELS[level]||level);
          notify(`模型「${row.id}」能力已更新：上下文 ${this.contextLabel(data.contextLimit)}${names.length?` · 思考深度 ${names.join("/")}`:" · 不支持思考深度"}`);
        }catch(error){ep.ElMessage.error("保存失败，请确认网关已启动");}
        this.capabilitySaving=false;
      },
      async putConfig(modelId,body){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/model-config/${encodeURIComponent(modelId)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
          if(!response.ok)ep.ElMessage.error("保存失败，请确认网关已启动");
        }catch(error){ep.ElMessage.error("保存失败，请确认网关已启动");}
      }
    }
  };
  mount("#modelConfigView", ModelConfigApp, "model-config");
})();

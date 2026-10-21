/**
 * 页面：api-create
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    bridge,
    ep,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;


  const ApiCreateApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-form-page">
          <el-page-header class="portal-vue-form-header" title="返回" :content="editingIndex<0?'新增 API':'编辑 API'" @back="back"></el-page-header>
          <div class="portal-vue-api-layout">
            <section class="portal-vue-api-picker">
              <div class="portal-vue-form-panel-head"><span>选择数据表</span><el-tag size="small">{{ selected.length }} 张</el-tag></div>
              <div class="portal-vue-form-panel-body"><el-input v-model="tableKeyword" clearable placeholder="搜索库名、表名、表中文名"></el-input><div v-for="asset in availableAssets" :key="asset.database+'.'+asset.table" class="portal-vue-source-item"><el-checkbox :model-value="isSelected(asset)" @change="value=>toggleAsset(asset,value)"><el-tooltip :content="(asset.externalName || asset.table) + '（' + asset.cnName + '）'" placement="right" :show-after="300"><strong>{{ asset.externalName || asset.table }}</strong></el-tooltip><small>{{ asset.cnName }} · {{ asset.fields.length }} 字段</small></el-checkbox></div></div>
            </section>
            <section class="portal-vue-api-config">
              <div class="portal-vue-form-panel-head"><span>接口配置</span></div>
              <div class="portal-vue-form-panel-body">
                <el-form label-position="top" class="portal-vue-dialog-form">
                  <el-form-item label="接口名称" required><el-input v-model="form.name" placeholder="例如：广告投放日报接口"></el-input></el-form-item>
                  <el-form-item label="使用场景" required><el-input v-model="form.usage" type="textarea" :rows="3" placeholder="说明调用系统、业务用途和责任人"></el-input></el-form-item>
                </el-form>
                <div v-for="item in selected" :key="item.database+'.'+item.table" class="portal-vue-selected-table">
                  <div class="portal-vue-selected-head"><div><span class="portal-vue-name">{{ assetFor(item)?.externalName || item.table }}</span><div class="portal-vue-muted" style="margin-top:4px">{{ assetFor(item)?.cnName }}</div></div><div style="display:flex;align-items:center;gap:8px"><span>调用频次</span><el-input-number v-model="item.rateLimit" :min="1" :controls="false"></el-input-number><span>次/分钟</span></div></div>
                  <div class="portal-vue-field-grid"><el-checkbox v-for="field in assetFor(item)?.fields || []" :key="field.name" :model-value="item.fieldNames.includes(field.name)" @change="value=>toggleField(item,field.name,value)">{{ field.name }} / {{ field.comment }}</el-checkbox></div>
                </div>
                <el-empty v-if="!selected.length" description="请先从左侧选择数据表"></el-empty>
              </div>
            </section>
          </div>
          <div class="portal-vue-form-actions"><el-button @click="back">取消</el-button><el-button v-if="canEdit('数据开放平台')" type="primary" :loading="saving" @click="save">{{ editingIndex<0?'生成 Token':'保存修改' }}</el-button></div>
        </div>
        <el-dialog v-model="tokenVisible" title="Token 生成成功" width="560px" :close-on-click-modal="false"><el-alert title="请妥善保存 Token，调用数据服务时需作为身份凭证。" type="success" :closable="false"></el-alert><div class="portal-vue-detail-grid" style="margin-top:16px"><div class="portal-vue-detail-item"><span>API 名称</span><strong>{{ savedApi?.name }}</strong></div><div class="portal-vue-detail-item"><span>授权范围</span><strong>{{ selected.length }} 张表 / {{ selectedFieldCount }} 个字段</strong></div></div><el-input :model-value="savedApi?.token" readonly><template #append><el-button @click="copySavedToken">复制</el-button></template></el-input><template #footer><el-button type="primary" @click="finish">完成</el-button></template></el-dialog>
      </el-config-provider>
    `,
    data: () => ({ editingIndex:-1, tableKeyword:"", form:{name:"",usage:""}, selected:[], saving:false, tokenVisible:false, savedApi:null }),
    computed: {
      availableAssets() { refreshTick.value; const keyword=this.tableKeyword.trim().toLowerCase(); return state.assets.filter(asset=>asset.status==="同步成功"&&(asset.serviceStatus||"启用")==="启用"&&(!keyword||`${asset.database} ${asset.table} ${asset.externalName} ${asset.cnName}`.toLowerCase().includes(keyword))); },
      selectedFieldCount() { return this.selected.reduce((sum,item)=>sum+item.fieldNames.length,0); }
    },
    mounted() { this.pageHandler=event=>{if(event.detail?.page==="新增API")this.load();}; window.addEventListener("portal:page-change",this.pageHandler); this.load(); },
    beforeUnmount() { window.removeEventListener("portal:page-change",this.pageHandler); },
    methods: {
      apiAssets(api) { return Array.isArray(api?.assets)&&api.assets.length?api.assets:[{database:api?.database,table:api?.assetTable,fieldNames:api?.fieldNames||[],rateLimit:Number(String(api?.rateLimit||"").match(/\d+/)?.[0])||60}]; },
      load() { this.editingIndex=Number.isInteger(window.portalApiEditingIndex)?window.portalApiEditingIndex:-1; const api=state.apis[this.editingIndex]; this.form=api?{name:api.name,usage:api.usage}:{name:"",usage:""}; this.selected=api?this.apiAssets(api).map(item=>({database:item.database,table:item.table,fieldNames:[...(item.fieldNames||[])],rateLimit:Number(item.rateLimit)||60})):[]; this.tableKeyword=""; },
      assetFor(item) { return state.assets.find(asset=>asset.database===item.database&&asset.table===item.table); },
      isSelected(asset) { return this.selected.some(item=>item.database===asset.database&&item.table===asset.table); },
      toggleAsset(asset,checked) { const index=this.selected.findIndex(item=>item.database===asset.database&&item.table===asset.table); if(checked&&index<0)this.selected.push({database:asset.database,table:asset.table,fieldNames:asset.fields.slice(0,3).map(field=>field.name),rateLimit:60}); else if(!checked&&index>=0)this.selected.splice(index,1); },
      toggleField(item,name,checked) { const index=item.fieldNames.indexOf(name); if(checked&&index<0)item.fieldNames.push(name); else if(!checked&&index>=0)item.fieldNames.splice(index,1); },
      back() { window.portalApiEditingIndex=-1; bridge.setPage("数据开放平台"); },
      save() {
        if(!this.form.name.trim()||!this.form.usage.trim())return ep.ElMessage.warning("请填写接口名称和使用场景");
        if(!this.selected.length)return ep.ElMessage.warning("请至少选择 1 张数据表");
        if(this.selected.some(item=>!item.fieldNames.length))return ep.ElMessage.warning("每张数据表至少授权 1 个字段");
        this.saving=true;
        window.setTimeout(()=>{
          const first=this.selected[0]; const existing=state.apis[this.editingIndex]; const payload={name:this.form.name.trim(),usage:this.form.usage.trim(),assetTable:first.table,database:first.database,fieldNames:[...first.fieldNames],assets:this.selected.map(item=>({...item,fieldNames:[...item.fieldNames]})),rateLimit:`每分钟 ${first.rateLimit} 次`,tokenStatus:existing?.tokenStatus||"启用",creator:existing?.creator||"曾祥竞",createdAt:existing?.createdAt||"2026-07-15 10:00",lastCall:existing?.lastCall||"尚未调用",callCount:existing?.callCount||0,callCount30d:existing?.callCount30d||0,token:existing?.token||`bjgw_live_${Date.now().toString(36)}****`};
          if(this.editingIndex<0)state.apis.unshift(payload);else Object.assign(existing,payload);
          this.savedApi=payload;this.saving=false;notify();
          if(this.editingIndex<0)this.tokenVisible=true;else{ep.ElMessage.success("API 配置已保存");this.back();}
        },700);
      },
      copySavedToken(){if(this.savedApi)bridge.copyToken(this.savedApi.token);ep.ElMessage.success("Token 已复制");},
      finish(){this.tokenVisible=false;this.back();}
    }
  };
  mount("#apiCreateView", ApiCreateApp, "api-create");
})();

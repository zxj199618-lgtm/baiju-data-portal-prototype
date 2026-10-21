/**
 * 页面：tag-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    ep,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  const TagManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><span style="color:#566174;font-weight:650">标签主体</span><el-select v-model="subject" class="portal-vue-filter-wide" @change="page=1"><el-option v-for="table in tables" :key="table.name" :label="table.cn+'（'+table.name+'）'" :value="table.name"></el-option></el-select><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索标签名、字段名" @input="page=1"></el-input></div>
            <el-tag effect="plain">{{ currentTable?.fields.length || 0 }} 个标签字段</el-tag>
          </div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无标签字段">
            <el-table-column prop="name" label="字段名" width="190" fixed="left"><template #default="scope"><code class="portal-vue-code">{{ scope.row.name }}</code></template></el-table-column>
            <el-table-column prop="cn" label="标签名称" width="160"><template #default="scope"><span class="portal-vue-name">{{ scope.row.cn }}</span></template></el-table-column>
            <el-table-column prop="type" label="标签类型" width="110"></el-table-column>
            <el-table-column label="枚举值" width="210" show-overflow-tooltip><template #default="scope">{{ scope.row.enumv || (scope.row.values || []).join('，') || '—' }}</template></el-table-column>
            <el-table-column prop="def" label="业务定义" min-width="220" show-overflow-tooltip><template #default="scope">{{ scope.row.def || '—' }}</template></el-table-column>
            <el-table-column prop="calc" label="计算口径" min-width="240" show-overflow-tooltip><template #default="scope">{{ scope.row.calc || '—' }}</template></el-table-column>
            <el-table-column prop="freq" label="更新频率" width="100"><template #default="scope">{{ scope.row.freq || '—' }}</template></el-table-column>
            <el-table-column label="覆盖率" width="100" align="right"><template #default="scope">{{ scope.row.cov ?? '—' }}<span v-if="scope.row.cov!==undefined">%</span></template></el-table-column>
            <el-table-column label="操作" width="88" fixed="right"><template #default="scope"><el-button v-if="canEdit('标签管理')" link type="primary" @click="openEdit(scope.row)">编辑</el-button></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
        <el-drawer v-model="editVisible" title="编辑标签信息" direction="rtl" size="680px" class="tag-enum-drawer" :close-on-click-modal="true">
          <el-form v-if="editForm" class="tag-enum-drawer-form" label-position="top">
            <el-form-item label="字段名"><el-input :model-value="editForm.name" disabled></el-input></el-form-item>
            <el-form-item label="标签名称" required><el-input v-model="editForm.cn"></el-input></el-form-item>
            <el-form-item label="业务定义"><el-input v-model="editForm.def" type="textarea" :rows="2"></el-input></el-form-item>
            <el-form-item label="计算口径"><el-input v-model="editForm.calc" type="textarea" :rows="2"></el-input></el-form-item>
            <section class="tag-enum-section">
              <div class="tag-enum-section-head"><strong>枚举值</strong><el-button v-if="editForm.enumMode==='manual'" link type="primary" @click="addEnumValue">添加枚举值</el-button></div>
              <el-radio-group v-model="editForm.enumMode" class="tag-enum-mode"><el-radio value="manual">手动添加</el-radio><el-radio value="upload">上传枚举值</el-radio></el-radio-group>
              <div v-if="editForm.enumMode==='upload'" class="tag-enum-import">
                <div class="tag-enum-import-copy"><strong>上传枚举值</strong><span>仅支持 UTF-8 TXT 格式，每行一个枚举值；不允许空行、重复值或逗号分隔。</span></div>
                <input ref="enumFileInput" class="tag-enum-file-input" type="file" accept=".txt,text/plain" @change="importEnumFile">
                <div class="tag-enum-import-actions"><el-button link type="primary" @click="downloadEnumTemplate">下载模板</el-button><el-button @click="triggerEnumFileInput">选择文件</el-button></div>
              </div>
              <div v-if="editForm.enumMode==='upload'&&editForm.enumImportedFileName" class="tag-enum-import-status"><strong>已导入 {{ editForm.enumValues.length }} 个枚举值</strong><span>{{ editForm.enumImportedFileName }}</span><el-button link type="danger" title="删除上传文件" @click="removeImportedEnumFile">删除</el-button></div>
              <div v-else-if="editForm.enumMode==='manual'" class="tag-enum-list">
                <div v-for="(value,index) in editForm.enumValues" :key="index" class="tag-enum-row">
                  <span class="tag-enum-row-index">{{ index + 1 }}</span>
                  <el-input v-model="editForm.enumValues[index]" :placeholder="'请输入第 ' + (index + 1) + ' 个枚举值'"></el-input>
                  <el-button text type="danger" title="删除枚举值" :disabled="editForm.enumValues.length===1" @click="removeEnumValue(index)">×</el-button>
                </div>
              </div>
            </section>
            <el-form-item label="更新频率" class="tag-enum-section"><el-select v-model="editForm.freq"><el-option label="实时" value="实时"></el-option><el-option label="小时" value="小时"></el-option><el-option label="离线" value="离线"></el-option></el-select></el-form-item>
          </el-form>
          <template #footer><el-button @click="editVisible=false">取消</el-button><el-button v-if="canEdit('标签管理')" type="primary" @click="saveEdit">保存</el-button></template>
        </el-drawer>
      </el-config-provider>
    `,
    data: () => ({ subject:state.tables[0]?.name||"",keyword:"",page:1,pageSize:10,editVisible:false,editForm:null,editTarget:null }),
    computed: {
      tables(){refreshTick.value;if(!state.tables.some(table=>table.name===this.subject))this.subject=state.tables[0]?.name||"";return state.tables;},
      currentTable(){return state.tables.find(table=>table.name===this.subject);},
      filteredRows(){refreshTick.value;const keyword=this.keyword.trim().toLowerCase();return (this.currentTable?.fields||[]).filter(field=>!keyword||`${field.name} ${field.cn}`.toLowerCase().includes(keyword));},
      pagedRows(){const result=paginate(this.filteredRows,this.page,this.pageSize);if(result.safePage!==this.page)this.page=result.safePage;return result.rows;},
      rangeText(){if(!this.filteredRows.length)return "0-0";return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`;}
    },
    methods:{
      normalizeEnumValues(values){return [...new Set((values||[]).map(value=>String(value).trim()).filter(Boolean))];},
      openEdit(field){const values=this.normalizeEnumValues(field.values?.length?field.values:String(field.enumv||"").split(/[，,]/));this.editTarget=field;this.editForm={...field,enumMode:"manual",enumValues:values.length?values:[""],enumImportedFileName:""};this.editVisible=true;},
      addEnumValue(){this.editForm?.enumValues.push("");},
      removeEnumValue(index){if(!this.editForm||this.editForm.enumValues.length===1)return;this.editForm.enumValues.splice(index,1);},
      triggerEnumFileInput(){this.$refs.enumFileInput?.click();},
      downloadEnumTemplate(){const content="枚举值示例 1\n枚举值示例 2\n";const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="标签枚举值模板.txt";document.body.appendChild(link);link.click();link.remove();},
      validateEnumFileContent(content){const source=String(content||"").replace(/^\uFEFF/,"");if(!source.trim())return {error:"文件内容为空，请按每行一个枚举值填写"};if(source.includes("\uFFFD"))return {error:"文件编码异常，请使用 UTF-8 编码的 TXT 文件"};const rows=source.split(/\r?\n/);if(rows.length>1&&rows.at(-1)==="")rows.pop();const values=[];const seen=new Map();for(let index=0;index<rows.length;index+=1){const lineNumber=index+1;const raw=rows[index];const value=raw.trim();if(!value)return {error:`第 ${lineNumber} 行为空，请保证每行只填写一个枚举值`};if(/[，,；;]/.test(raw))return {error:`第 ${lineNumber} 行包含分隔符，请每行只填写一个枚举值`};if(/[\t\f\v]/.test(raw))return {error:`第 ${lineNumber} 行包含制表符或特殊分隔符，请每行只填写一个枚举值`};if(seen.has(value))return {error:`第 ${lineNumber} 行与第 ${seen.get(value)} 行重复，请删除重复枚举值`};seen.set(value,lineNumber);values.push(value);}return {values};},
      async importEnumFile(event){const file=event.target?.files?.[0];if(!file)return;if(!/\.txt$/i.test(file.name)&&file.type!=="text/plain"){ep.ElMessage.warning("请上传 TXT 格式文件");event.target.value="";return;}const result=this.validateEnumFileContent(await file.text());event.target.value="";if(result.error){ep.ElMessage.error(`枚举值文件格式校验失败：${result.error}`);return;}this.editForm.enumValues=result.values;this.editForm.enumImportedFileName=file.name;ep.ElMessage.success(`枚举值文件格式校验通过，已导入 ${result.values.length} 个枚举值`);},
      removeImportedEnumFile(){if(!this.editForm)return;this.editForm.enumValues=[];this.editForm.enumImportedFileName="";ep.ElMessage.success("已删除上传的枚举值文件");},
      saveEdit(){if(!this.editForm?.cn.trim())return ep.ElMessage.warning("请输入标签名称");if(this.editForm.enumMode==="upload"&&!this.editForm.enumImportedFileName)return ep.ElMessage.warning("请上传 TXT 枚举值文件");const values=this.normalizeEnumValues(this.editForm.enumValues);Object.assign(this.editTarget,this.editForm,{values,enumv:values.join("，")});this.editVisible=false;notify("标签信息已保存");}
    }
  };
  mount("#tagCatalogView", TagManagementApp, "tag-management");
})();

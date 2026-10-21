/**
 * 页面：target-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    confirmAction,
    mount,
    notify,
    paginate,
    refreshTick,
    state
  } = window.PortalVue;


  const TargetManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <el-tabs v-model="status" class="portal-vue-status-tabs" @tab-change="page=1"><el-tab-pane label="启用中" name="启用"></el-tab-pane><el-tab-pane label="已停用" name="停用"></el-tab-pane></el-tabs>
          <div class="portal-vue-toolbar"><div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索目标名称、存储桶" @input="page=1"></el-input></div><el-button v-if="canEdit('人群包推送渠道')" type="primary" @click="openCreate">新增推送目标</el-button></div>
          <el-table :data="pagedRows" class="portal-vue-table" border empty-text="暂无推送目标">
            <el-table-column label="目标名称" width="190" fixed="left"><template #default="scope"><span class="portal-vue-name">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column label="类型" width="90"><template #default><el-tag effect="plain">OSS</el-tag></template></el-table-column>
            <el-table-column prop="bucket" label="存储桶名称" min-width="200" show-overflow-tooltip><template #default="scope"><code class="portal-vue-code">{{ scope.row.bucket }}</code></template></el-table-column>
            <el-table-column prop="region" label="存储地域" width="150"></el-table-column>
            <el-table-column prop="endpoint" label="访问域名" min-width="260" show-overflow-tooltip></el-table-column>
            <el-table-column prop="refs" label="被引用" width="100" align="right"><template #default="scope">{{ scope.row.refs || 0 }} 个人群包</template></el-table-column>
            <el-table-column prop="last" label="最近使用" width="170"></el-table-column>
            <el-table-column label="状态" width="86" align="center"><template #default="scope"><el-switch :disabled="!canEdit('人群包推送渠道')" :model-value="(scope.row.status||'启用')==='启用'" @change="value=>toggleStatus(scope.row,value)"></el-switch></template></el-table-column>
          </el-table>
          <div class="portal-vue-pagination"><span>共 {{ filteredRows.length }} 条，当前 {{ rangeText }}</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="filteredRows.length" layout="sizes, prev, pager, next"></el-pagination></div>
        </section>
        <el-dialog v-model="createVisible" title="新增推送目标" width="620px" @closed="resetCreateForm">
          <el-form ref="targetFormRef" :model="form" :rules="targetRules" class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="目标名称" prop="name"><el-input v-model="form.name" placeholder="例如：巨量DMP-OSS"></el-input></el-form-item>
            <el-form-item label="存储桶名称（bucket_name）" prop="bucket"><el-input v-model="form.bucket"></el-input></el-form-item>
            <el-form-item label="存储地域（Region）" prop="region"><el-input v-model="form.region" placeholder="例如：cn-shenzhen"></el-input></el-form-item>
            <el-form-item label="访问域名（endpoint）" prop="endpoint"><el-input v-model="form.endpoint"></el-input></el-form-item>
            <el-form-item label="访问密钥 ID（access_key_id）" prop="ak"><el-input v-model="form.ak"></el-input></el-form-item>
            <el-form-item label="访问密钥 Secret（access_key_secret）" prop="sk"><el-input v-model="form.sk" type="password" show-password></el-input></el-form-item>
          </el-form>
          <template #footer><el-button @click="createVisible=false">取消</el-button><el-button v-if="canEdit('人群包推送渠道')" type="primary" @click="saveCreate">保存目标</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({
      status:"启用",
      keyword:"",
      page:1,
      pageSize:10,
      createVisible:false,
      form:{name:"",bucket:"",region:"",endpoint:"",ak:"",sk:""},
      targetRules:{
        name:[{required:true,whitespace:true,message:"请输入目标名称",trigger:"blur"}],
        bucket:[{required:true,whitespace:true,message:"请输入存储桶名称",trigger:"blur"}],
        region:[{required:true,whitespace:true,message:"请输入存储地域",trigger:"blur"}],
        endpoint:[{required:true,whitespace:true,message:"请输入访问域名",trigger:"blur"}],
        ak:[{required:true,whitespace:true,message:"请输入访问密钥 ID",trigger:"blur"}],
        sk:[{required:true,whitespace:true,message:"请输入访问密钥 Secret",trigger:"blur"}]
      }
    }),
    computed:{
      filteredRows(){refreshTick.value;const keyword=this.keyword.trim().toLowerCase();return state.targets.filter(item=>(item.status||"启用")===this.status&&(!keyword||`${item.name} ${item.bucket}`.toLowerCase().includes(keyword)));},
      pagedRows(){const result=paginate(this.filteredRows,this.page,this.pageSize);if(result.safePage!==this.page)this.page=result.safePage;return result.rows;},
      rangeText(){if(!this.filteredRows.length)return "0-0";return `${(this.page-1)*this.pageSize+1}-${Math.min(this.page*this.pageSize,this.filteredRows.length)}`;}
    },
    mounted(){this.primaryHandler=event=>{if(event.detail?.page==="人群包推送渠道")this.openCreate();};window.addEventListener("portal:primary-action",this.primaryHandler);},
    beforeUnmount(){window.removeEventListener("portal:primary-action",this.primaryHandler);},
    methods:{
      openCreate(){this.form={name:"",bucket:"flink-baiju-prod",region:"cn-shenzhen",endpoint:"https://oss-cn-shenzhen.aliyuncs.com",ak:"",sk:""};this.createVisible=true;this.$nextTick(()=>this.$refs.targetFormRef?.clearValidate());},
      resetCreateForm(){this.$refs.targetFormRef?.resetFields();},
      async saveCreate(){const valid=await this.$refs.targetFormRef?.validate().catch(()=>false);if(!valid)return;const payload=Object.fromEntries(Object.entries(this.form).map(([key,value])=>[key,String(value).trim()]));state.targets.unshift({...payload,sk:"********",refs:0,last:"尚未使用",status:"启用"});this.createVisible=false;notify(`推送目标「${payload.name}」已保存`);},
      async toggleStatus(target,enabled){const refs=Number(target.refs||0);const note=!enabled&&refs?`，当前有 ${refs} 个人群包正在引用` : "";if(!await confirmAction(enabled?"启用推送目标":"停用推送目标",`确认${enabled?"启用":"停用"}「${target.name}」${note}？`))return;target.status=enabled?"启用":"停用";notify(`推送目标已${target.status}`);}
    }
  };
  mount("#pushTargetView", TargetManagementApp, "target-management");
})();

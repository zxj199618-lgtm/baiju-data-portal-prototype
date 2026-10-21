/**
 * 页面：skill-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    analysisGatewayBase,
    ep,
    isImageIconValue,
    loginUser,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;


  const SkillManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-input v-model="keyword" class="portal-vue-search" clearable placeholder="搜索 Skill 名称"></el-input></div>
            <el-button v-if="canEdit('Skill 配置')" type="primary" @click="openCreate">＋ 新增 Skill</el-button>
          </div>
          <el-table :data="filteredRows" class="portal-vue-table" border empty-text="暂无 Skill">
            <el-table-column label="Skill" min-width="280"><template #default="scope"><div><span class="portal-vue-name">{{ scope.row.name }}</span><div class="portal-vue-muted" style="margin-top:2px">{{ scope.row.desc }}</div></div></template></el-table-column>
            <el-table-column label="工作台展示" min-width="280"><template #default="scope"><div v-if="scope.row.enabled!==false" style="display:flex;align-items:center;gap:8px"><span class="portal-vue-skill-cell-icon"><img v-if="isImageIcon(scope.row.icon)" :src="scope.row.icon" alt="" /><span v-else>{{ scope.row.icon }}</span></span><div><span style="font-size:13px">{{ scope.row.title }}</span><div class="portal-vue-muted" style="font-size:12px">{{ scope.row.displayDesc }}</div></div><el-tag size="small" effect="plain" style="margin-left:4px">排序 {{ scope.row.sort }}</el-tag></div><span v-else class="portal-vue-muted">已下线</span></template></el-table-column>
            <el-table-column prop="version" label="当前版本" width="120"></el-table-column>
            <el-table-column label="状态" width="150"><template #default="scope"><div style="display:flex;align-items:center;gap:6px"><el-switch :disabled="!canEdit('Skill 配置')" v-model="scope.row.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a" @change="toggleEnabled(scope.row)"></el-switch><el-tag v-if="scope.row.enabled!==false && skillStatus(scope.row)!=='已发布'" size="small" :type="skillStatus(scope.row)==='未发布' ? 'info' : 'warning'" effect="light">{{ skillStatus(scope.row) }}</el-tag></div></template></el-table-column>
            <el-table-column label="灰度用户" min-width="170"><template #default="scope"><div v-if="scope.row.grayUsers.length" style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in scope.row.grayUsers.slice(0,3)" :key="user" size="small" effect="plain">{{ user }}</el-tag><span v-if="scope.row.grayUsers.length>3" class="portal-vue-muted">+{{ scope.row.grayUsers.length-3 }}</span></div><span v-else class="portal-vue-muted">全量发布</span></template></el-table-column>
            <el-table-column label="调用次数" width="100" align="right"><template #default="scope">{{ scope.row.stats.calls }}</template></el-table-column>
            <el-table-column label="操作" width="170" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button v-if="canEdit('Skill 配置')" link type="primary" @click="openVersionManage(scope.row)">版本管理</el-button><el-button v-if="canEdit('Skill 配置')" link type="primary" @click="openNewVersion(scope.row)">新增版本</el-button></div></template></el-table-column>
          </el-table>
          <div class="portal-vue-muted" style="margin-top:12px">Skill 在门户手动维护（名称 / 图标 / 描述 / 排序 / 提示词 / 上线状态），新增与修改即时生效；版本、灰度与回滚在「版本管理」中操作，无需发版。</div>
        </section>
        <!-- 新增 Skill 字段多（含 6 行提示词），弹窗 15vh 顶距 + body max-height 会超出视口把底部按钮裁掉；
             改成右侧抽屉：整屏高、内容区独立滚动、底部「取消 / 新增 Skill」常驻可见。 -->
        <el-drawer v-model="createVisible" title="新增 Skill" size="620px" direction="rtl" class="portal-vue-skill-create-drawer" destroy-on-close :close-on-click-modal="true">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="Skill 名称" required><el-input v-model="createForm.name" placeholder="如：人群包效果分析 Skill"></el-input></el-form-item>
            <el-form-item label="工作台展示标题" required><el-input v-model="createForm.title" placeholder="如：人群包效果分析"></el-input></el-form-item>
            <el-form-item label="图标">
              <div class="portal-vue-skill-icon-upload" @click="$refs.createIconInput?.click()">
                <span class="portal-vue-skill-icon-preview"><img v-if="isImageIcon(createForm.icon)" :src="createForm.icon" alt="图标" /><span v-else>{{ createForm.icon || "✦" }}</span></span>
                <span class="portal-vue-skill-icon-tips"><strong>点击上传图标</strong><small>支持 png / jpg / gif / svg，不超过 300KB；不传用默认图标</small></span>
              </div>
              <input ref="createIconInput" type="file" accept="image/*" style="display:none" @change="onCreateIconUpload"></input>
            </el-form-item>
            <el-form-item label="描述"><el-input v-model="createForm.desc" type="textarea" :rows="2" resize="none" placeholder="列表里展示的一句话说明"></el-input></el-form-item>
            <el-form-item label="工作台展示描述"><el-input v-model="createForm.displayDesc" placeholder="如：分群规模与转化对比"></el-input></el-form-item>
            <el-form-item label="排序（越小越靠前）"><el-input-number v-model="createForm.sort" :min="1" :max="999"></el-input-number></el-form-item>
            <el-form-item label="提示词"><el-input v-model="createForm.prompt" type="textarea" :rows="6" resize="none" placeholder="该 Skill 的分析指令，保存后即时生效"></el-input></el-form-item>
            <el-form-item label="初始版本号" required><el-input v-model="createForm.version" placeholder="如：v1.0"></el-input></el-form-item>
            <el-form-item label="上线状态"><el-switch v-model="createForm.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a"></el-switch><span class="portal-vue-muted" style="margin-left:10px;font-size:12px">上线后立即出现在灵犀智析工作台</span></el-form-item>
          </el-form>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="createVisible=false">取消</el-button><el-button v-if="canEdit('Skill 配置')" type="primary" @click="saveCreate">新增 Skill</el-button></div>
          </template>
        </el-drawer>
        <el-drawer v-model="editVisible" :title="'新增版本 · ' + (activeSkill?.name || '')" size="620px" direction="rtl" class="portal-vue-edit-drawer" :close-on-click-modal="true">
          <el-form v-if="activeSkill" class="portal-vue-dialog-form" label-position="top">
            <el-form-item label="工作台展示标题" required><el-input v-model="editForm.title" placeholder="如：数据查询与指标解答"></el-input></el-form-item>
            <el-form-item label="图标">
              <div class="portal-vue-skill-icon-upload" @click="openIconPicker">
                <span class="portal-vue-skill-icon-preview"><img v-if="isImageIcon(editForm.icon)" :src="editForm.icon" alt="图标" /><span v-else>{{ editForm.icon || "✦" }}</span></span>
                <span class="portal-vue-skill-icon-tips"><strong>点击上传图标</strong><small>支持 png / jpg / gif / svg，不超过 300KB；不传沿用当前图标</small></span>
              </div>
              <input ref="iconInput" type="file" accept="image/*" style="display:none" @change="onIconUpload"></input>
            </el-form-item>
            <el-form-item label="描述"><el-input v-model="editForm.desc" type="textarea" :rows="2" resize="none" placeholder="列表里展示的一句话说明"></el-input></el-form-item>
            <el-form-item label="工作台展示描述"><el-input v-model="editForm.displayDesc" placeholder="如：趋势、分布与异常"></el-input></el-form-item>
            <el-form-item label="排序（越小越靠前）"><el-input-number v-model="editForm.sort" :min="1" :max="999"></el-input-number></el-form-item>
            <template v-if="activeSkill?.kind==='router'">
              <el-form-item label="自动路由规则"><div class="portal-vue-route-editor">
                <p class="portal-vue-muted" style="margin:0 0 10px;font-size:12px">问题命中某条规则的关键词时，转交给对应技能；命中最多者优先，都未命中则使用兜底技能。只会选择对当前用户可用（已上线、在灰度范围内）的技能。</p>
                <div v-for="(route,index) in editForm.routes" :key="index" class="portal-vue-route-row">
                  <el-select v-model="route.skillId" placeholder="选择技能" style="width:200px"><el-option v-for="item in routeOptions" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select>
                  <el-input v-model="route.keywords" placeholder="命中关键词，用顿号分隔，如 血缘、上游、下游"></el-input>
                  <el-button link type="danger" @click="editForm.routes.splice(index,1)">删除</el-button>
                </div>
                <el-button @click="editForm.routes.push({skillId:'',keywords:''})">＋ 新增规则</el-button>
              </div></el-form-item>
              <el-form-item label="兜底技能（未命中关键词时使用）"><el-select v-model="editForm.fallbackSkillId" placeholder="选择兜底技能" style="width:260px"><el-option v-for="item in routeOptions" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select></el-form-item>
            </template>
            <el-form-item v-else label="提示词"><el-input v-model="editForm.prompt" type="textarea" :rows="6" resize="none" placeholder="该版本的分析指令，保存后即时生效"></el-input></el-form-item>
            <el-form-item label="版本号" required><el-input v-model="editForm.version" placeholder="如：v1.4"></el-input></el-form-item>
            <el-form-item label="版本内容说明"><el-input v-model="editForm.versionNote" type="textarea" :rows="2" resize="none" placeholder="如：新增自动澄清、修复口径问题"></el-input></el-form-item>
            <el-form-item label="上线状态"><el-switch :disabled="!canEdit('Skill 配置')" v-model="editForm.enabled" inline-prompt active-text="上线" inactive-text="下线" active-color="#16a34a"></el-switch><span class="portal-vue-muted" style="margin-left:10px;font-size:12px">新版本先保存为「未发布」，到版本管理灰度 / 发版</span></el-form-item>
          </el-form>
          <template #footer>
            <div style="display:flex;justify-content:flex-end;gap:10px"><el-button @click="editVisible=false">取消</el-button><el-button v-if="canEdit('Skill 配置')" type="primary" @click="saveAll">保存为新版本</el-button></div>
          </template>
        </el-drawer>
        <el-drawer v-model="publishVisible" size="640px" :close-on-click-modal="true">
          <template #header>
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
              <span style="font-size:16px;font-weight:600">{{ publishSkill?.name || "" }} · 版本管理</span>
              <span class="portal-vue-muted" style="font-size:12px">共 {{ (publishSkill?.versions || []).length }} 个版本 · 新增版本请到列表页对应行操作</span>
            </div>
          </template>
          <div class="portal-vue-skill-drawer">
            <el-alert type="info" :closable="false" title="版本管理只做版本操作：未发布可选灰度用户测试，灰度中可调整灰度或「发版」成为正式版本；历史版本可查看，正式版本可回滚。新增版本请到列表页对应行点「新增版本」。" :show-icon="true"></el-alert>
            <div v-for="item in publishSkill?.versions || []" :key="item.version" class="portal-vue-skill-version" :class="{ current: item.current }">
              <div class="portal-vue-skill-version-head">
                <strong>{{ item.version }}</strong><el-tag v-if="item.current" size="small" type="success" effect="light">当前</el-tag><el-tag size="small" :type="versionStatusType(item)" effect="light">{{ versionStatusName(item) }}</el-tag><time>{{ item.time }}</time>
              </div>
              <p>{{ item.note }}</p>
              <div v-if="item.grayUsers?.length" style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0"><el-tag v-for="user in item.grayUsers" :key="user" size="small" effect="plain">{{ user }}</el-tag><span class="portal-vue-muted" style="font-size:12px">（灰度用户）</span></div>
              <div class="portal-vue-muted">操作人：{{ item.operator }}</div>
              <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
                <template v-if="versionStatusName(item) !== '已发布'">
                  <el-button v-if="(versionStatusName(item) === '未发布') && canEdit('Skill 配置')" size="small" @click="openGrayDraft(item)">灰度</el-button>
                  <el-button v-if="(versionStatusName(item) === '灰度中') && canEdit('Skill 配置')" size="small" @click="openGrayDraft(item)">调整灰度</el-button>
                  <el-button v-if="(versionStatusName(item) === '灰度中') && canEdit('Skill 配置')" size="small" type="primary" @click="publishVersion(item)">发版</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="openViewVersion(item)">查看</el-button>
                  <el-button v-if="(!item.current) && canEdit('Skill 配置')" size="small" @click="rollback(item)">回滚到此版本</el-button>
                </template>
              </div>
            </div>
            <p v-if="!publishSkill?.versions?.length" class="portal-vue-muted">暂无版本：到列表页对应行点「新增版本」创建</p>
          </div>
        </el-drawer>
        <el-drawer v-model="viewVisible" :title="(publishSkill?.name || '') + ' · ' + (viewVersion?.version || '') + ' 版本详情'" size="560px" :close-on-click-modal="true">
          <div v-if="viewVersion" class="portal-vue-skill-drawer">
            <div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e9edf4;border-radius:10px;background:#fafcff">
              <span class="portal-vue-skill-icon-preview" style="width:48px;height:48px"><img v-if="isImageIcon(viewVersion.snapshot?.icon)" :src="viewVersion.snapshot?.icon" alt="" /><span v-else style="font-size:22px">{{ viewVersion.snapshot?.icon || "✦" }}</span></span>
              <div style="display:grid;gap:2px"><strong style="font-size:14px">{{ viewVersion.snapshot?.title || publishSkill?.title || "—" }}</strong><span class="portal-vue-muted" style="font-size:12px">{{ viewVersion.snapshot?.displayDesc || "（无描述）" }}</span></div>
              <el-tag style="margin-left:auto" size="small" :type="versionStatusType(viewVersion)" effect="light">{{ versionStatusName(viewVersion) }}</el-tag>
            </div>
            <div class="portal-vue-alert-field"><label>描述</label><span>{{ viewVersion.snapshot?.desc || publishSkill?.desc || "—" }}</span></div>
            <div class="portal-vue-alert-field"><label>排序</label><span>{{ viewVersion.snapshot?.sort ?? publishSkill?.sort ?? "—" }}</span></div>
            <div class="portal-vue-alert-field"><label>上线状态</label><span>{{ viewVersion.snapshot?.enabled === false ? "下线" : "上线" }}</span></div>
            <div class="portal-vue-alert-field"><label>版本内容说明</label><span>{{ viewVersion.note || "—" }}</span></div>
            <div class="portal-vue-alert-field"><label>灰度用户</label><div style="display:flex;flex-wrap:wrap;gap:4px"><el-tag v-for="user in viewVersion.grayUsers || []" :key="user" size="small" effect="plain">{{ user }}</el-tag><span v-if="!viewVersion.grayUsers?.length" class="portal-vue-muted">无（全量发布）</span></div></div>
            <div class="portal-vue-alert-field"><label>提示词</label><pre class="portal-vue-alert-sql" style="white-space:pre-wrap">{{ viewVersion.snapshot?.prompt || publishSkill?.prompt || "（无）" }}</pre></div>
            <div class="portal-vue-muted" style="font-size:12px">版本时间：{{ viewVersion.time }} · 操作人：{{ viewVersion.operator }}</div>
          </div>
        </el-drawer>
        <el-dialog v-model="grayDialogVisible" :title="'灰度测试 - ' + (grayVersion?.version || '')" width="520px">
          <div class="portal-vue-skill-drawer">
            <el-alert type="info" :closable="false" title="选择灰度测试用户，仅这些用户可见该版本；验证没问题后再点「发版」全量发布。" :show-icon="true"></el-alert>
            <el-select v-model="grayDraft" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择灰度用户" style="width:100%">
              <el-option v-for="user in activeUsers" :key="user.name" :label="user.name" :value="user.name"><span>{{ user.name }}</span><span class="portal-vue-muted" style="float:right;font-size:12px">{{ user.dept }}</span></el-option>
            </el-select>
          </div>
          <template #footer><el-button @click="grayDialogVisible=false">取消</el-button><el-button v-if="canEdit('Skill 配置')" type="primary" @click="saveGrayDraft">确定灰度</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({keyword:"",createVisible:false,createForm:{},editVisible:false,editForm:{},activeSkill:null,publishVisible:false,publishSkill:null,viewVisible:false,viewVersion:null,grayDialogVisible:false,grayVersion:null,grayDraft:[]}),
    computed:{
      skills(){refreshTick.value;return (state.skills||[]).filter(item=>item.id!=="numa-warehouse");},
      routeOptions(){refreshTick.value;return (state.skills||[]).filter(item=>item.kind!=="router"&&item.id!=="numa-warehouse").map(item=>({id:item.id,name:item.title||item.name}));},
      filteredRows(){const keyword=this.keyword.trim().toLowerCase();return this.skills.filter(item=>!keyword||`${item.name} ${item.title||""} ${item.desc||""}`.toLowerCase().includes(keyword));},
      currentUser(){refreshTick.value;return loginUser()||state.users[0];},
      activeUsers(){refreshTick.value;return state.users.filter(user=>user.status!=="已停用");}
    },
    methods:{
      openCreate(){
        const maxSort=(state.skills||[]).reduce((max,item)=>Math.max(max,Number(item.sort)||0),0);
        this.createForm={name:"",title:"",icon:"✦",desc:"",displayDesc:"",sort:maxSort+10,prompt:"",version:"v1.0",enabled:true};
        this.createVisible=true;
      },
      async saveCreate(){
        const form=this.createForm;
        const name=String(form.name||"").trim();
        const title=String(form.title||"").trim();
        if(!name)return ep.ElMessage.warning("请输入 Skill 名称");
        if(!title)return ep.ElMessage.warning("请输入工作台展示标题");
        if((state.skills||[]).some(item=>item.name===name))return ep.ElMessage.warning("Skill 名称已存在");
        const version=String(form.version||"").trim()||"v1.0";
        const id=`skill-${Date.now().toString(36)}`;
        const now=new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-");
        const skill={
          id, name, source:id, local:true, version, grayUsers:[],
          icon:form.icon||"✦", title, displayDesc:String(form.displayDesc||"").trim(), sort:Number(form.sort)||50, scenarioKey:id,
          enabled:form.enabled!==false, desc:String(form.desc||"").trim(), scenarios:"",
          clarification:{enabled:false,question:"",options:[]}, assetScope:"", responseContract:[],
          prompt:String(form.prompt||""),
          versions:[{version,time:now,operator:this.currentUser?.name||"曾祥竞",note:"新建 Skill",current:true,status:"已发布",grayUsers:[]}],
          stats:{calls:0,successRate:"—",avgLatency:"—",tokens:"—"}
        };
        state.skills.unshift(skill);
        try{
          await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({icon:skill.icon,title:skill.title,displayDesc:skill.displayDesc,sort:skill.sort,enabled:skill.enabled,scenarioKey:skill.scenarioKey})});
        }catch(error){/* 网关未启动时仅保存在原型状态 */}
        this.createVisible=false;
        notify(`Skill「${name}」已新增（${version}）${skill.enabled?"并上线":"，当前为下线状态"}，灵犀智析工作台即时生效`);
      },
      async loadGatewaySkills(){
        try{
          const response=await fetch(`${analysisGatewayBase}/v1/skills`);
          if(!response.ok)return;
          const list=await response.json();
          if(Array.isArray(list)&&list.length){
            const locals=(state.skills||[]).filter(item=>item.local&&!list.some(entry=>entry.id===item.id));
            state.skills=[...list.map(entry=>({ ...entry, versions: entry.versions || [], stats: entry.stats || { calls: 0, successRate: "—", avgLatency: "—", tokens: "—" } })), ...locals];
          }
        }catch(error){/* 网关未启动时保留内置注册表 */}
      },
      openVersionManage(row){this.publishSkill=row;this.publishVisible=true;},
      /** 新增版本只从 Skill 列表行进入：表单不再嵌在版本管理里，避免抽屉叠抽屉 */
      openNewVersion(row){
        const skill=row||this.publishSkill;
        if(!skill)return;
        this.activeSkill=skill;
        this.editForm={icon:skill.icon||"✦",title:skill.title||"",desc:skill.desc||"",displayDesc:skill.displayDesc||"",sort:skill.sort||50,enabled:skill.enabled!==false,prompt:skill.prompt||"",version:this.nextVersion(),versionNote:"",routes:(skill.routes||[]).map(route=>({skillId:route.skillId,keywords:(route.keywords||[]).join("、")})),fallbackSkillId:skill.fallbackSkillId||""};
        this.editVisible=true;
      },
      openViewVersion(item){this.viewVersion=item;this.viewVisible=true;},
      async saveAll(){
        const form=this.editForm;
        const skill=this.activeSkill;
        if(!skill)return;
        if(!String(form.title||"").trim())return ep.ElMessage.warning("请输入工作台展示标题");
        const note=String(form.versionNote||"").trim()||"更新配置";
        const routing=skill.kind==="router";
        const routes=routing?(form.routes||[]).map(route=>({skillId:route.skillId,keywords:String(route.keywords||"").split(/[、,，]/).map(item=>item.trim()).filter(Boolean)})).filter(route=>route.skillId):undefined;
        const snapshot={icon:form.icon||"✦",title:form.title.trim(),desc:String(form.desc||"").trim(),displayDesc:String(form.displayDesc||"").trim(),sort:form.sort,enabled:form.enabled,prompt:form.prompt,...(routing?{routes,fallbackSkillId:form.fallbackSkillId}:{})};
        Object.assign(skill,snapshot);
        const version=String(form.version||"").trim()||this.nextVersion();
        skill.versions=(skill.versions||[]).map(item=>({...item,current:false}));
        skill.versions.unshift({version,time:new Date().toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-"),operator:this.currentUser?.name||"曾祥竞",note,current:true,status:"未发布",grayUsers:[],snapshot});
        skill.version=version;
        try{await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(skill.id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({icon:snapshot.icon,title:snapshot.title,desc:snapshot.desc,displayDesc:snapshot.displayDesc,sort:snapshot.sort,enabled:snapshot.enabled,prompt:snapshot.prompt,...(routing?{routes,fallbackSkillId:snapshot.fallbackSkillId}:{}),latestVersion:{version,note,status:"未发布",grayUsers:[]}})});}catch(error){/* 网关未连接时保留原型状态 */}
        this.editVisible=false;
        notify(`「${skill.name}」已保存为 ${version}（未发布，可到「版本管理」灰度 / 发版）`);
      },
      nextVersion(){
        const current=String(this.activeSkill?.version||"v1.0");
        const match=current.match(/^v(\d+)\.(\d+)/);
        return match?`v${match[1]}.${Number(match[2])+1}`:"v1.1";
      },
      async toggleEnabled(row){
        const enabled=row.enabled!==false;
        try{await fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(row.id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled})});}catch(error){/* 网关未连接时保留原型状态 */}
        notify(`「${row.name}」已${enabled?"上线，灵犀智析恢复展示":"下线，灵犀智析立即隐藏"}`);
      },
      isImageIcon(icon){return isImageIconValue(icon);},
      openIconPicker(){this.$refs.iconInput?.click();},
      onIconUpload(event){this.applyIcon(event,this.editForm);},
      onCreateIconUpload(event){this.applyIcon(event,this.createForm);},
      applyIcon(event,target){
        const file=event.target.files?.[0];
        event.target.value="";
        if(!file)return;
        if(!/^image\/(png|jpe?g|gif|svg\+xml|webp)$/i.test(file.type))return ep.ElMessage.warning("请选择图片文件");
        if(file.size>300*1024)return ep.ElMessage.warning("图片不能超过 300KB");
        const reader=new FileReader();
        reader.onload=()=>{target.icon=String(reader.result||"").slice(0,200000);ep.ElMessage.success("图标已上传，保存后生效");};
        reader.readAsDataURL(file);
      },
      openVersionManage(row){this.publishSkill=row;this.publishVisible=true;},
      versionStatusName(item){return item.status||"已发布";},
      versionStatusType(item){
        const status=item.status||"已发布";
        return status==="未发布"?"info":status==="灰度中"?"warning":"success";
      },
      openGrayDraft(item){this.grayVersion=item;this.grayDraft=[...(item.grayUsers||[])];this.grayDialogVisible=true;},
      saveGrayDraft(){
        if(!this.grayVersion)return;
        this.grayVersion.grayUsers=[...this.grayDraft];
        this.grayVersion.status="灰度中";
        this.grayDialogVisible=false;
        notify(`「${this.publishSkill?.name}」${this.grayVersion.version} 已灰度给 ${this.grayDraft.length} 位用户测试`);
      },
      async publishVersion(item){
        try{await ep.ElMessageBox.confirm(`确认将「${this.publishSkill?.name}」${item.version} 发布为正式版本（全量可见）？`, "发版确认", { type: "warning", confirmButtonText: "发版", cancelButtonText: "取消" });}catch(error){return;}
        item.status="已发布";
        notify(`「${this.publishSkill?.name}」${item.version} 已正式发布`);
      },
      rollback(item){
        const skill=this.publishSkill||this.activeSkill;
        if(item.snapshot){
          Object.assign(skill,{icon:item.snapshot.icon,title:item.snapshot.title,desc:item.snapshot.desc,displayDesc:item.snapshot.displayDesc,sort:item.snapshot.sort,enabled:item.snapshot.enabled,prompt:item.snapshot.prompt});
          try{fetch(`${analysisGatewayBase}/v1/skills/${encodeURIComponent(skill.id)}/config`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({icon:item.snapshot.icon,title:item.snapshot.title,desc:item.snapshot.desc,displayDesc:item.snapshot.displayDesc,sort:item.snapshot.sort,enabled:item.snapshot.enabled,prompt:item.snapshot.prompt})});}catch(error){}
        }
        skill.versions.forEach(version=>version.current=version===item);
        skill.version=item.version;
        notify(`「${skill.name}」已回滚到 ${item.version}${item.snapshot?"，配置已恢复":""}`);
      },
      skillStatus(row){
        const current=(row.versions||[]).find(item=>item.current);
        if(!current)return row.grayUsers?.length?"灰度中":"已发布";
        return current.status||"已发布";
      },
    }
  };
  mount("#skillManagementView", SkillManagementApp, "skill-management");
})();

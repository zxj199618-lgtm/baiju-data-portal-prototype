/**
 * 页面：menu-management
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    confirmAction,
    ep,
    mount,
    notify
  } = window.PortalVue;


  const menuTreeSeed = [
    { id: "M100", name: "数据看板", icon: "pie", sort: 100, path: "/data-board/index", cache: true, permission: "data_board", children: [] },
    {
      id: "M300", name: "数据资产", icon: "asset", sort: 300, path: "/data-asset", cache: true, permission: "data_asset",
      children: [
        { id: "M310", name: "看板管理", icon: "--", sort: 10, path: "/board-management/index", cache: true, permission: "board_management", children: [] },
        { id: "M320", name: "表管理", icon: "--", sort: 20, path: "/data-asset/table-management/index", cache: true, permission: "table_management", children: [] }
      ]
    },
    {
      id: "M500", name: "数据服务", icon: "service", sort: 500, path: "/data-service", cache: true, permission: "data_service",
      children: [
        { id: "M510", name: "开放 API", icon: "--", sort: 10, path: "/data-service/api-config/index", cache: true, permission: "api_config", children: [] }
      ]
    },
    {
      id: "M900", name: "权限管理", icon: "permission", sort: 900, path: "/privilege", cache: true, permission: "privilege_management",
      children: [
        { id: "M910", name: "用户管理", icon: "--", sort: 10, path: "/privilege/user-management/index", cache: true, permission: "user_management", children: [] },
        { id: "M920", name: "权限组", icon: "--", sort: 20, path: "/privilege/permission-group/index", cache: true, permission: "permission_group", children: [] }
      ]
    },
    {
      id: "M950", name: "AI 中心", icon: "ai", sort: 950, path: "/ai", cache: true, permission: "ai_center",
      children: [
        { id: "M1020", name: "Skill 配置", icon: "--", sort: 10, path: "/ai/skill-management/index", cache: true, permission: "ai_skill_management", children: [] },
        { id: "M1030", name: "模型配置", icon: "--", sort: 20, path: "/ai/model-config/index", cache: true, permission: "ai_model_config", children: [] }
      ]
    },
    {
      id: "M1060", name: "大数据工具箱", icon: "toolbox", sort: 600, path: "/toolbox/bigdata", cache: true, permission: "toolbox_bigdata",
      children: [
        { id: "M1080", name: "补数据", icon: "--", sort: 20, path: "/toolbox/bigdata/backfill/index", cache: true, permission: "toolbox_bigdata_backfill", children: [] },
        { id: "M1090", name: "消耗对比", icon: "--", sort: 30, path: "/toolbox/bigdata/compare/index", cache: true, permission: "toolbox_bigdata_compare", children: [] },
        { id: "M1100", name: "环境域名", icon: "--", sort: 40, path: "/toolbox/bigdata/env-domains/index", cache: true, permission: "toolbox_bigdata_env_domains", children: [] }
      ]
    },
    {
      id: "M1110", name: "业务工具箱", icon: "toolboxBiz", sort: 610, path: "/toolbox/biz", cache: true, permission: "toolbox_biz",
      children: [
        { id: "M1120", name: "生成人群包", icon: "--", sort: 10, path: "/toolbox/biz/audience-package/index", cache: true, permission: "toolbox_biz_audience", children: [] },
        { id: "M1130", name: "短剧投放账户上报", icon: "--", sort: 20, path: "/toolbox/biz/drama-accounts/index", cache: true, permission: "toolbox_biz_drama_accounts", children: [] }
      ]
    },
    {
      id: "M1000", name: "系统管理", icon: "system", sort: 10000, path: "/system", cache: true, permission: "system_management",
      children: [
        { id: "M1010", name: "菜单管理", icon: "--", sort: 10, path: "/system/menu-management/index", cache: true, permission: "system_menu_management", children: [] }
      ]
    }
  ];

  const menuIcons = ["pie", "asset", "service", "permission", "system", "analysis", "push", "ai", "toolbox", "toolboxBiz"];


  const MenuManagementApp = {
    template: `
      <el-config-provider :locale="locale">
        <section class="portal-vue-panel">
          <div class="portal-vue-toolbar">
            <div class="portal-vue-toolbar-left"><el-button v-if="canEdit('菜单管理')" type="primary" @click="openForm(null, null)">＋ 添加</el-button></div>
          </div>
          <el-table :data="treeRows" row-key="id" :tree-props="{ children: 'children' }" default-expand-all class="portal-vue-table" border empty-text="暂无菜单">
            <el-table-column label="菜单显示名称" min-width="220"><template #default="scope"><span :class="{ 'portal-vue-name': !scope.row.parentId }">{{ scope.row.name }}</span></template></el-table-column>
            <el-table-column label="图标" width="80" align="center"><template #default="scope"><el-icon v-if="scope.row.icon !== '--'" :size="16"><span>{{ iconGlyph(scope.row.icon) }}</span></el-icon><span v-else class="portal-vue-muted">--</span></template></el-table-column>
            <el-table-column prop="sort" label="排序" width="90" align="center"></el-table-column>
            <el-table-column prop="path" label="组件路径" min-width="240"><template #default="scope"><code class="portal-vue-code">{{ scope.row.path }}</code></template></el-table-column>
            <el-table-column label="缓冲" width="90" align="center"><template #default="scope"><el-switch :disabled="!canEdit('菜单管理')" :model-value="scope.row.cache" @change="value=>toggleCache(scope.row,value)"></el-switch></template></el-table-column>
            <el-table-column prop="permission" label="权限标识" min-width="200"><template #default="scope"><code class="portal-vue-code">{{ scope.row.permission }}</code></template></el-table-column>
            <el-table-column label="操作" width="240" fixed="right"><template #default="scope"><div class="portal-vue-actions"><el-button v-if="canEdit('菜单管理')" link type="primary" @click="openForm(null, scope.row)" :disabled="scope.row.children.length>=3">＋ 添加</el-button><el-button v-if="canEdit('菜单管理')" link type="primary" @click="openForm(scope.row, null)">✎ 编辑</el-button><el-button v-if="canEdit('菜单管理')" link type="danger" @click="removeMenu(scope.row)">🗑 删除</el-button></div></template></el-table-column>
          </el-table>
        </section>
        <el-dialog v-model="formVisible" :title="editingId ? '编辑菜单' : (parentMenu ? '添加子菜单' : '添加菜单')" width="640px">
          <el-form class="portal-vue-dialog-form" label-position="top">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
              <el-form-item label="菜单显示名称" required><el-input v-model="form.name" placeholder="如：数据看板"></el-input></el-form-item>
              <el-form-item label="上级菜单"><el-select v-model="form.parentId" clearable placeholder="不选则为顶级目录"><el-option v-for="item in rootMenus" :key="item.id" :label="item.name" :value="item.id"></el-option></el-select></el-form-item>
              <el-form-item label="图标"><el-select v-model="form.icon"><el-option label="--（子菜单）" value="--"></el-option><el-option v-for="icon in icons" :key="icon" :label="icon" :value="icon"></el-option></el-select></el-form-item>
              <el-form-item label="排序" required><el-input-number v-model="form.sort" :min="1" :max="99999" style="width:100%"></el-input-number></el-form-item>
              <el-form-item label="组件路径" required><el-input v-model="form.path" placeholder="/system/menu-management/index"></el-input></el-form-item>
              <el-form-item label="权限标识" required><el-input v-model="form.permission" placeholder="system_menu_management"></el-input></el-form-item>
            </div>
            <el-form-item label="缓冲（页面缓存）"><el-switch :disabled="!canEdit('菜单管理')" v-model="form.cache"></el-switch></el-form-item>
          </el-form>
          <template #footer><el-button @click="formVisible=false">取消</el-button><el-button v-if="canEdit('菜单管理')" type="primary" @click="save">保存</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({menus:menuTreeSeed.map(item=>({...item,children:item.children.map(child=>({...child,parentId:item.id}))})),formVisible:false,editingId:"",parentId:"",form:{},icons:menuIcons}),
    computed:{
      rootMenus(){return this.menus;},
      treeRows(){return this.menus;}
    },
    methods:{
      iconGlyph(icon){return {pie:"◔",asset:"▤",service:"▣",permission:"🔒",system:"⚙",analysis:"✦",push:"⇩",ai:"◈",toolbox:"🧰",toolboxBiz:"📦"}[icon]||"●";},
      findMenu(id,list=this.menus,parent=null){for(const item of list){if(item.id===id)return{menu:item,parent};const found=this.findMenu(id,item.children,item);if(found)return found;}return null;},
      toggleCache(row,value){const found=this.findMenu(row.id);if(found){found.menu.cache=value;notify(`「${row.name}」缓存已${value?"开启":"关闭"}`);}},
      openForm(row,parent){this.editingId=row?.id||"";this.parentId=parent?.id||row?.parentId||"";this.form=row?{name:row.name,parentId:row.parentId||"",icon:row.icon,sort:row.sort,path:row.path,cache:row.cache,permission:row.permission}:{name:"",parentId:parent?.id||"",icon:parent?"--":"pie",sort:parent?(parent.children.length+1)*10:100,path:"",cache:true,permission:""};this.formVisible=true;},
      save(){
        const name=String(this.form.name||"").trim();
        const path=String(this.form.path||"").trim();
        const permission=String(this.form.permission||"").trim();
        if(!name)return ep.ElMessage.warning("请输入菜单显示名称");
        if(!path)return ep.ElMessage.warning("请输入组件路径");
        if(!permission)return ep.ElMessage.warning("请输入权限标识");
        if(this.editingId){
          const found=this.findMenu(this.editingId);
          if(!found)return ep.ElMessage.error("菜单不存在");
          Object.assign(found.menu,{name,icon:this.form.icon,sort:this.form.sort,path,cache:this.form.cache,permission});
          notify(`菜单「${name}」已保存`);
        }else{
          const id=`M${Date.now()}`;
          const node={id,name,icon:this.form.icon,sort:this.form.sort,path,cache:this.form.cache,permission,children:[],parentId:this.form.parentId||""};
          if(this.form.parentId){const found=this.findMenu(this.form.parentId);if(!found)return ep.ElMessage.error("上级菜单不存在");found.menu.children.push(node);}
          else this.menus.push(node);
          notify(`菜单「${name}」已添加`);
        }
        this.formVisible=false;
      },
      async removeMenu(row){
        if(row.children.length)return ep.ElMessage.warning("请先删除子菜单");
        if(!await confirmAction("删除菜单",`确认删除菜单「${row.name}」？删除后相关权限组的菜单权限将同步失效。`))return;
        if(row.parentId){const parent=this.findMenu(row.parentId);parent.menu.children=parent.menu.children.filter(item=>item.id!==row.id);}
        else this.menus=this.menus.filter(item=>item.id!==row.id);
        notify(`菜单「${row.name}」已删除`);
      }
    }
  };
  mount("#menuManagementView", MenuManagementApp, "menu-management");
})();

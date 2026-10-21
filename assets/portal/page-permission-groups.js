/**
 * 页面：permission-groups
 * 依赖 core.js（window.PortalVue）；由 portal-vue-module.js 按页面拆分而来。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;
  const {
    confirmAction,
    ep,
    menuGrantItems,
    mount,
    notify,
    refreshTick,
    state
  } = window.PortalVue;


  const PermissionGroupApp = {
    template: `
      <el-config-provider :locale="locale">
        <div class="portal-vue-split">
          <aside class="portal-vue-split-left">
            <div class="portal-vue-split-head"><strong>权限组</strong><el-button v-if="canEdit('权限组')" link type="primary" @click="openCreate">新增</el-button></div>
            <div class="portal-vue-split-body"><article v-for="(item,index) in state.groups" :key="item.name" class="portal-vue-group-card" :class="{active:index===selectedIndex}" @click="selectGroup(index)"><div class="portal-vue-group-meta"><div><h3>{{ item.name }}</h3><span class="portal-vue-muted">{{ userCount(item.name) }} 人</span></div><el-dropdown trigger="click" @command="command=>groupCommand(command,index)" @click.stop><el-button text circle title="更多操作">⋮</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item v-if="canEdit('权限组')" command="edit">编辑</el-dropdown-item><el-dropdown-item v-if="canEdit('权限组')" command="delete" divided>删除</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><p>{{ item.desc }}</p><div class="portal-vue-muted" style="margin-top:8px">{{ item.boards.includes('全部看板')?'全部看板':item.boards.length+' 个看板' }} · {{ item.tables?.includes('全部数据表')?'全部数据表':(item.tables?.length||0)+' 张数据表' }}</div></article></div>
          </aside>
          <section class="portal-vue-split-right">
            <div class="portal-vue-split-head"><strong>{{ activeGroup?.name || '权限组详情' }}</strong><div class="portal-vue-group-detail-actions"><el-button class="portal-vue-member-entry" @click="memberDrawer=true">成员 <el-tag size="small" round>{{ activeGroupUsers.length }}</el-tag></el-button><el-button v-if="canEdit('权限组')" type="primary" :disabled="!dirty" @click="saveGroup">保存</el-button></div></div>
            <div class="portal-vue-permission-body">
              <el-tabs v-model="activeTab" class="portal-vue-group-tabs"><el-tab-pane label="菜单权限" name="menus"></el-tab-pane><el-tab-pane name="boards"><template #label>看板查看范围 <el-tag size="small" round>{{ boardBadge }}</el-tag></template></el-tab-pane><el-tab-pane name="tables"><template #label>数据表权限 <el-tag size="small" round>{{ tableBadge }}</el-tag></template></el-tab-pane></el-tabs>
              <section v-show="activeTab==='menus'" class="portal-vue-group-permission-panel">
                <p class="portal-vue-muted" style="margin:0 0 12px">每个菜单区分「查看」与「编辑」：只勾查看=只读，勾上编辑才能在该菜单内新增/修改/删除；勾选编辑会自动带上查看。</p>
                <div class="portal-vue-permission-card-grid portal-vue-menu-card-grid">
                  <article v-for="section in state.nav" :key="section.group" class="portal-vue-group-permission-card">
                    <div class="portal-vue-menu-row portal-vue-menu-row-head">
                      <span class="portal-vue-menu-name portal-vue-menu-name-parent">{{ section.group }}</span>
                      <span class="portal-vue-menu-checks">
                        <el-checkbox class="portal-vue-view-check" :model-value="sectionChecked(section)" :indeterminate="sectionIndeterminate(section)" @change="value=>toggleSection(section,value)">查看</el-checkbox>
                        <el-checkbox class="portal-vue-edit-check" :model-value="editSectionChecked(section)" :indeterminate="editSectionIndeterminate(section)" @change="value=>toggleEditSection(section,value)">编辑</el-checkbox>
                      </span>
                    </div>
                    <div v-if="permItems(section).length>1" class="portal-vue-child-checks">
                      <div v-for="item in permItems(section)" :key="item.name" class="portal-vue-menu-row">
                        <span class="portal-vue-menu-name">{{ item.name }}</span>
                        <span class="portal-vue-menu-checks">
                          <el-checkbox class="portal-vue-view-check" :model-value="selectedMenus.includes(item.name)" @change="value=>toggleMenu(item.name,value)">查看</el-checkbox>
                          <el-checkbox class="portal-vue-edit-check" :model-value="menuEditChecked(section,item)" @change="value=>toggleEdit(item.name,value,section)">编辑</el-checkbox>
                        </span>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
              <section v-show="activeTab==='boards'" class="portal-vue-group-permission-panel">
                <div class="portal-vue-board-range-toolbar"><span>按看板分类配置可查看范围</span><el-checkbox v-model="allBoards" @change="toggleAllBoards">全部看板</el-checkbox></div>
                <div class="portal-vue-permission-card-grid portal-vue-board-card-grid">
                  <article v-for="group in boardGroups" :key="group.category" class="portal-vue-group-permission-card">
                    <strong class="portal-vue-permission-card-title">{{ group.category }}</strong>
                    <div class="portal-vue-child-checks portal-vue-board-checks"><el-checkbox v-for="board in group.boards" :key="board.name" :title="board.name" :disabled="allBoards" :model-value="boardChecked(board.name)" @change="value=>toggleBoard(board.name,value)">{{ board.name }}</el-checkbox></div>
                  </article>
                </div>
              </section>
              <section v-show="activeTab==='tables'" class="portal-vue-group-permission-panel">
                <div class="portal-vue-board-range-toolbar"><span>配置该权限组可在灵犀智析和 API 服务中使用的数据表</span><el-checkbox :model-value="allTablesSelected" :indeterminate="tablesIndeterminate" @change="toggleAllTables">全部数据表</el-checkbox></div>
                <div class="portal-vue-permission-card-grid portal-vue-board-card-grid">
                  <article v-for="group in tableGroups" :key="group.source" class="portal-vue-group-permission-card">
                    <strong class="portal-vue-permission-card-title">{{ group.source }}</strong>
                    <div class="portal-vue-child-checks portal-vue-board-checks"><el-checkbox v-for="table in group.tables" :key="table.cnName" :title="table.cnName" :model-value="selectedTables.includes(table.cnName)" @change="value=>toggleTable(table.cnName,value)">{{ table.cnName }}</el-checkbox></div>
                  </article>
                </div>
                <p class="portal-vue-muted" style="margin-top:12px">未勾选任何数据表时，该权限组成员无法在灵犀智析发起分析和调用数据 API。</p>
              </section>
            </div>
          </section>
        </div>
        <el-drawer v-model="memberDrawer" :title="(activeGroup?.name || '权限组') + ' · 成员'" size="760px" class="portal-vue-member-drawer" :close-on-click-modal="true">
          <div class="portal-vue-member-toolbar"><div><strong>拥有此权限组的人</strong><span>共 {{ activeGroupUsers.length }} 人</span></div><el-button v-if="canEdit('权限组')" type="primary" @click="openMemberDialog">添加成员</el-button></div>
          <el-table :data="activeGroupUsers" class="portal-vue-table portal-vue-member-table" border max-height="calc(100vh - 190px)" empty-text="该权限组暂无成员">
            <el-table-column label="用户" min-width="180"><template #default="scope"><div class="portal-vue-member-user"><el-avatar :size="30" :style="avatarStyle(scope.row.name)">{{ avatarText(scope.row.name) }}</el-avatar><div><strong>{{ scope.row.name }}</strong><span>{{ scope.row.email || '—' }}</span></div></div></template></el-table-column>
            <el-table-column prop="dept" label="组织" min-width="220" show-overflow-tooltip></el-table-column>
            <el-table-column prop="role" label="角色" width="120"></el-table-column>
            <el-table-column label="操作" width="90" align="center"><template #default="scope"><el-button v-if="canEdit('权限组')" link type="danger" @click="removeMember(scope.row)">移除</el-button></template></el-table-column>
          </el-table>
        </el-drawer>
        <el-dialog v-model="formVisible" :title="editingIndex<0?'新增权限组':'编辑权限组'" width="560px"><el-form class="portal-vue-dialog-form" label-position="top"><el-form-item label="权限组名称" required><el-input v-model="groupForm.name"></el-input></el-form-item><el-form-item label="描述"><el-input v-model="groupForm.desc" type="textarea" :rows="3"></el-input></el-form-item></el-form><template #footer><el-button @click="formVisible=false">取消</el-button><el-button v-if="canEdit('权限组')" type="primary" @click="saveGroupForm">保存</el-button></template></el-dialog>
        <el-dialog v-model="memberVisible" title="添加权限组成员" width="620px">
          <el-form class="portal-vue-dialog-form" label-position="top"><el-form-item label="选择用户"><el-select v-model="memberSelection" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="3" placeholder="搜索姓名或组织"><el-option v-for="user in availableUsers" :key="user.feishu || user.name" :label="user.name + ' · ' + (user.dept || '未挂部门')" :value="user.feishu || user.name"><div class="portal-vue-member-option"><span>{{ user.name }}</span><small>{{ user.dept || '未挂部门' }} · 当前 {{ user.group || '未分配' }}</small></div></el-option></el-select></el-form-item></el-form>
          <template #footer><el-button @click="memberVisible=false">取消</el-button><el-button v-if="canEdit('权限组')" type="primary" :disabled="!memberSelection.length" @click="addMembers">添加成员</el-button></template>
        </el-dialog>
      </el-config-provider>
    `,
    data:()=>({state,selectedIndex:0,activeTab:"menus",selectedMenus:[],selectedMenuEdits:[],selectedBoards:[],allBoards:false,selectedTables:[],dirty:false,formVisible:false,editingIndex:-1,groupForm:{},memberDrawer:false,memberVisible:false,memberSelection:[]}),
    computed:{
      activeGroup(){refreshTick.value;return state.groups[this.selectedIndex]||state.groups[0];},
      boardGroups(){return state.categories.filter(category=>category!=="全部").map(category=>({category,boards:state.boards.filter(board=>board.category===category&&board.status==="已上线")})).filter(group=>group.boards.length);},
      boardBadge(){if(this.allBoards)return state.boards.filter(board=>board.status==="已上线").length;return this.selectedBoards.length;},
      tableGroups(){const groups=[];state.assets.forEach(table=>{let group=groups.find(item=>item.source===table.source);if(!group){group={source:table.source,tables:[]};groups.push(group);}group.tables.push(table);});return groups;},
      allTableNames(){return state.assets.map(table=>table.cnName);},
      allTablesSelected(){return this.selectedTables.length>0&&this.selectedTables.length>=this.allTableNames.length;},
      tablesIndeterminate(){return this.selectedTables.length>0&&this.selectedTables.length<this.allTableNames.length;},
      tableBadge(){return this.selectedTables.length;},
      activeGroupUsers(){refreshTick.value;const groupName=this.activeGroup?.name;return groupName?state.users.filter(user=>user.group===groupName):[];},
      availableUsers(){refreshTick.value;const groupName=this.activeGroup?.name;return state.users.filter(user=>user.group!==groupName&&user.status!=="已停用");}
    },
    mounted(){this.loadGroup();this.primaryHandler=event=>{if(event.detail?.page==="权限组")this.openCreate();};window.addEventListener("portal:primary-action",this.primaryHandler);},
    beforeUnmount(){window.removeEventListener("portal:primary-action",this.primaryHandler);},
    methods:{
      userCount(name){return state.users.filter(user=>user.group===name).length;},
      avatarText(name){return String(name||"用").slice(0,1);},
      avatarStyle(name){const colors=["#1677ff","#13a8a8","#7c3aed","#d97706","#dc4c64","#35805b"];const seed=[...String(name||"")].reduce((total,char)=>total+char.charCodeAt(0),0);return{background:colors[seed%colors.length],color:"#fff"};},
      selectGroup(index){this.selectedIndex=index;this.activeTab="menus";this.memberDrawer=false;this.loadGroup();},
      loadGroup(){const group=state.groups[this.selectedIndex]||state.groups[0];if(!group)return;this.selectedMenus=[...group.menus];this.selectedMenuEdits=[...(group.menuEdits||[])];this.allBoards=group.boards.includes("全部看板");this.selectedBoards=this.allBoards?[]:state.boards.filter(board=>group.boards.includes(board.name)||group.boards.includes(board.category)).map(board=>board.name);const tablesGrant=group.tables||[];this.selectedTables=tablesGrant.includes("全部数据表")?[...this.allTableNames]:state.assets.filter(table=>tablesGrant.includes(table.cnName)).map(table=>table.cnName);this.dirty=false;},
      permItems(section){return menuGrantItems(section);},
      sectionNames(section){const items=this.permItems(section);return items.length===1?[items[0].name]:[section.group,...items.map(item=>item.name)];},
      sectionChecked(section){const names=this.sectionNames(section);return names.every(name=>this.selectedMenus.includes(name));},
      sectionIndeterminate(section){const names=this.sectionNames(section);const count=names.filter(name=>this.selectedMenus.includes(name)).length;return count>0&&count<names.length;},
      toggleSection(section,checked){this.sectionNames(section).forEach(name=>this.toggleMenu(name,checked,false));this.dirty=true;},
      toggleMenu(name,checked,mark=true){const index=this.selectedMenus.indexOf(name);if(checked&&index<0)this.selectedMenus.push(name);else if(!checked&&index>=0){this.selectedMenus.splice(index,1);const editIndex=this.selectedMenuEdits.indexOf(name);if(editIndex>=0)this.selectedMenuEdits.splice(editIndex,1);}if(mark)this.dirty=true;},
      menuEditChecked(section,item){return this.selectedMenuEdits.includes(item.name)||(section.items.length>1&&this.selectedMenuEdits.includes(section.group));},
      editSectionChecked(section){const names=this.sectionNames(section);return names.every(name=>this.selectedMenuEdits.includes(name));},
      editSectionIndeterminate(section){const names=this.sectionNames(section);const count=names.filter(name=>this.selectedMenuEdits.includes(name)).length;return count>0&&count<names.length;},
      toggleEditSection(section,checked){this.sectionNames(section).forEach(name=>this.toggleEdit(name,checked,section,false));this.dirty=true;},
      toggleEdit(name,checked,section,mark=true){const index=this.selectedMenuEdits.indexOf(name);if(checked){if(index<0)this.selectedMenuEdits.push(name);if(!this.selectedMenus.includes(name))this.selectedMenus.push(name);}else if(index>=0)this.selectedMenuEdits.splice(index,1);if(mark)this.dirty=true;},
      toggleAllBoards(value){this.allBoards=value;if(value)this.selectedBoards=[];this.dirty=true;},
      // 勾选「全部看板」后逐项放开：分类下的看板仍不可单独操作，但应显示为已勾选，避免看起来像没授权
      boardChecked(name){return this.allBoards||this.selectedBoards.includes(name);},
      toggleBoard(name,checked){const index=this.selectedBoards.indexOf(name);if(checked&&index<0)this.selectedBoards.push(name);else if(!checked&&index>=0)this.selectedBoards.splice(index,1);this.dirty=true;},
      toggleAllTables(value){this.selectedTables=value?[...this.allTableNames]:[];this.dirty=true;},
      toggleTable(name,checked){const index=this.selectedTables.indexOf(name);if(checked&&index<0)this.selectedTables.push(name);else if(!checked&&index>=0)this.selectedTables.splice(index,1);this.dirty=true;},
      saveGroup(){this.activeGroup.menus=[...this.selectedMenus];this.activeGroup.menuEdits=[...this.selectedMenuEdits];this.activeGroup.boards=this.allBoards?["全部看板"]:[...this.selectedBoards];this.activeGroup.tables=this.selectedTables.length>=this.allTableNames.length?["全部数据表"]:[...this.selectedTables];this.dirty=false;notify("权限组配置已保存");},
      openMemberDialog(){this.memberSelection=[];this.memberVisible=true;},
      addMembers(){if(!this.memberSelection.length)return;const groupName=this.activeGroup?.name;if(!groupName)return;const selected=new Set(this.memberSelection);let count=0;state.users.forEach(user=>{if(selected.has(user.feishu||user.name)){user.group=groupName;if(user.status!=="已停用")user.status="启用";count+=1;}});this.memberVisible=false;this.memberSelection=[];notify(`已添加 ${count} 名成员到「${groupName}」`);},
      async removeMember(user){const groupName=this.activeGroup?.name;if(!groupName||!await confirmAction("移除权限组成员",`确认将「${user.name}」从「${groupName}」移除？`))return;user.group="未分配";if(user.status!=="已停用")user.status="未分配权限组";notify(`已从「${groupName}」移除 ${user.name}`);},
      openCreate(){this.editingIndex=-1;this.groupForm={name:"",desc:""};this.formVisible=true;},
      openEdit(index){this.editingIndex=index;this.groupForm={name:state.groups[index].name,desc:state.groups[index].desc};this.formVisible=true;},
      async groupCommand(command,index){if(command==="edit")return this.openEdit(index);const group=state.groups[index];if(this.userCount(group.name)>0)return ep.ElMessage.warning("该权限组下仍有用户，不能删除");if(!await confirmAction("删除权限组",`确认删除「${group.name}」？`))return;state.groups.splice(index,1);this.selectedIndex=Math.max(0,Math.min(this.selectedIndex,state.groups.length-1));this.loadGroup();notify("权限组已删除");},
      saveGroupForm(){const name=this.groupForm.name.trim();if(!name)return ep.ElMessage.warning("请输入权限组名称");if(state.groups.some((group,index)=>index!==this.editingIndex&&group.name===name))return ep.ElMessage.warning("权限组名称已存在");if(this.editingIndex<0){state.groups.push({name,desc:this.groupForm.desc.trim()||"自定义权限组。",menus:["灵犀智析","数据看板"],menuEdits:[],boards:[],tables:[],status:"启用"});this.selectedIndex=state.groups.length-1;}else{const group=state.groups[this.editingIndex];const oldName=group.name;group.name=name;group.desc=this.groupForm.desc.trim()||"自定义权限组。";state.users.forEach(user=>{if(user.group===oldName)user.group=name;});}this.formVisible=false;this.loadGroup();notify("权限组已保存");}
    }
  };
  mount("#permissionGroupView", PermissionGroupApp, "permission-groups");
})();

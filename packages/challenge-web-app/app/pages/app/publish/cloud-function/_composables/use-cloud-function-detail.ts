import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import { logger } from '~~/lib/logger';
import type { CloudFunctionVersionRow } from '~/types/cloud-function';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.png';

export interface ICloudFunctionForm {
   description: string;
   kvUserIsolated: boolean;
   timeoutMs: number;
   enabled: boolean;
}

/** 版本行：在接口返回的基础上补上发布者的展示信息。 */
export interface ICloudFunctionVersionRow extends CloudFunctionVersionRow {
   creatorName: string;
   creatorAvatarUrl: string;
}

/**
 * 云函数详情页（发布侧）的数据与操作。
 *
 * 负责加载「函数 + 版本 + 生效版本源码」，并封装保存、发布新版本、切换版本、删除。
 */
export const useCloudFunctionDetail = (name: Ref<string>) => {
   const { $trpc } = useNuxtApp();
   const message = useMessage();
   const appBaseUrl = useRuntimeConfig().public.appBaseUrl;

   const loadDetail = async () => {
      const fn = await $trpc.admin.cloudFunction.get.query({
         name: name.value,
      });
      const versions = await $trpc.admin.cloudFunction.listVersions.query({
         name: name.value,
      });
      let source = '';
      if (fn.activeVersion) {
         const active = await $trpc.admin.cloudFunction.getVersion.query({
            name: name.value,
            version: fn.activeVersion.version,
         });
         source = active.source ?? '';
      }
      return { fn, versions, source };
   };

   const { data, pending, error, refresh } = useAsyncData(
      `cloud-function-${name.value}`,
      loadDetail,
   );

   watch(
      error,
      (newError) => {
         if (newError) {
            logger.error(newError, '加载云函数详情失败');
            message.error('加载失败', '云函数可能已被删除');
         }
      },
      { immediate: true },
   );

   const form = reactive<ICloudFunctionForm>({
      description: '',
      kvUserIsolated: true,
      timeoutMs: 5000,
      enabled: true,
   });
   const sourceDraft = ref('');

   watch(
      data,
      (value) => {
         if (!value) return;
         form.description = value.fn.description;
         form.kvUserIsolated = value.fn.kvUserIsolated;
         form.timeoutMs = value.fn.timeoutMs;
         form.enabled = value.fn.enabled;
         sourceDraft.value = value.source;
      },
      { immediate: true },
   );

   /** 版本行：把发布者解析成「昵称 + 头像地址」，供表格直接展示。 */
   const versionRows = computed<ICloudFunctionVersionRow[]>(() =>
      (data.value?.versions ?? []).map((version) => ({
         ...version,
         creatorName: version.createdByUser?.displayName ?? version.createdBy,
         creatorAvatarUrl: version.createdByUser?.avatarUrl
            ? `${appBaseUrl}${version.createdByUser.avatarUrl}`
            : DEFAULT_AVATAR_URL,
      })),
   );

   // ── 保存基本信息 ─────────────────────────────────────────────────────────
   const saving = ref(false);
   const handleSave = async () => {
      saving.value = true;
      try {
         await $trpc.admin.cloudFunction.update.mutate({
            name: name.value,
            description: form.description,
            kvUserIsolated: form.kvUserIsolated,
            timeoutMs: form.timeoutMs,
            enabled: form.enabled,
         });
         message.success('保存成功');
         await refresh();
      } catch (err) {
         message.error('保存失败', (err as Error)?.message ?? '请稍后重试');
      } finally {
         saving.value = false;
      }
   };

   // ── 保存 / 发布新版本 ──────────────────────────────────────────────────
   const editorOpened = ref(false);
   const publishing = ref(false);
   const handlePublish = async (source: string) => {
      publishing.value = true;
      try {
         const result = await $trpc.admin.cloudFunction.publishVersion.mutate({
            name: name.value,
            source,
         });
         message.success(
            '发布成功',
            result.reused
               ? `源码未变，复用版本 v${result.version}`
               : `新版本 v${result.version}`,
         );
         editorOpened.value = false;
         await refresh();
      } catch (err) {
         message.error('发布失败', (err as Error)?.message ?? '请检查源码');
      } finally {
         publishing.value = false;
      }
   };

   /** 保存但不发布：只生成版本，不设为生效，之后可在版本历史里手动设为生效。 */
   const savingVersion = ref(false);
   const handleSaveDraft = async (source: string) => {
      savingVersion.value = true;
      try {
         const result = await $trpc.admin.cloudFunction.publishVersion.mutate({
            name: name.value,
            source,
            activate: false,
         });
         message.success(
            '已保存（未发布）',
            result.reused
               ? `源码未变，复用版本 v${result.version}，未设为生效`
               : `新版本 v${result.version} 已保存，可在版本历史里设为生效`,
         );
         editorOpened.value = false;
         await refresh();
      } catch (err) {
         message.error('保存失败', (err as Error)?.message ?? '请检查源码');
      } finally {
         savingVersion.value = false;
      }
   };

   // ── 版本历史 ─────────────────────────────────────────────────────────────
   const activating = ref<number | null>(null);
   const handleActivate = async (version: number) => {
      if (version === data.value?.fn.activeVersion?.version) return;
      activating.value = version;
      try {
         await $trpc.admin.cloudFunction.activateVersion.mutate({
            name: name.value,
            version,
         });
         message.success('切换成功', `当前生效版本 v${version}`);
         await refresh();
      } catch (err) {
         message.error('切换失败', (err as Error)?.message ?? '请稍后重试');
      } finally {
         activating.value = null;
      }
   };

   // ── 删除 ─────────────────────────────────────────────────────────────────
   const handleDelete = async () => {
      const confirmed = await dialog.confirm({
         title: '删除云函数',
         description: `确定要删除「${name.value}」吗？所有版本与调用记录将一并移除，此操作不可撤销。`,
         variant: 'danger',
         confirmText: '删除',
         cancelText: '取消',
      });
      if (!confirmed) return;

      try {
         await $trpc.admin.cloudFunction.remove.mutate({
            name: name.value,
            hard: true,
         });
         message.success('已删除');
         await navigateTo('/app/publish/cloud-function');
      } catch (err) {
         message.error('删除失败', (err as Error)?.message ?? '请稍后重试');
      }
   };

   return {
      data,
      pending,
      versionRows,
      form,
      sourceDraft,
      editorOpened,
      saving,
      savingVersion,
      publishing,
      activating,
      handleSave,
      handleSaveDraft,
      handlePublish,
      handleActivate,
      handleDelete,
   };
};

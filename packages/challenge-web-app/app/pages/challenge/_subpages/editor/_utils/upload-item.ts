/** 资源管理器待上传的文件；relativePath 为相对于上传目标目录的路径（拖入文件夹时包含子目录） */
export interface IUploadItem {
   file: File;
   relativePath: string;
}

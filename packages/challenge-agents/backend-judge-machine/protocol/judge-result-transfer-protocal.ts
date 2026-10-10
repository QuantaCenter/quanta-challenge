/**
 * Judge Result Transfer Protocol (JRTP)
 *
 * 判题结果传输协议
 *
 * 协议结构：[JSON长度(4字节)] + [JSON数据] + [Buffer数据...]
 */
export class JRTP {
   static readonly VERSION = '1.0';
   static readonly AUTHOR = 'still-soda';

   /**
    * 从数据中提取 Buffer 并返回包含 Buffer 元数据的新对象。
    * Buffer 存储在单独的数组中，返回的对象包含 Buffer 的元数据，
    * 包括它们的类型、长度和在 Buffer 数组中的索引。
    *
    * @param data 要提取 Buffer 的数据。
    * @param buffers 存储提取的 Buffer 的数组。
    * @returns 包含转换后数据和 Buffer 数组的对象。
    *          转换后的数据包含每个 Buffer 的元数据，包括其类型、
    *          长度和在 Buffer 数组中的索引。
    */
   private extractBuffer(
      data: Record<string, any>,
      buffers: Buffer[] = []
   ): {
      tranferedData: Record<string, any>;
      buffers: Buffer[];
   } {
      let tranferedData: Record<string, any> = {};

      Object.entries(data).forEach(([key, value]) => {
         if (!Object.prototype.hasOwnProperty.call(data, key)) {
            return;
         }

         if (Buffer.isBuffer(value)) {
            const index = buffers.length;
            buffers.push(value);
            tranferedData[key] = {
               type: 'Buffer',
               length: value.length,
               index: index,
            };
         } else if (Array.isArray(value)) {
            if (value.every((item) => Buffer.isBuffer(item))) {
               // Buffer数组处理
               const bufferArray = value as Buffer[];
               tranferedData[key] = bufferArray.map((buffer) => {
                  const index = buffers.length;
                  buffers.push(buffer);
                  return {
                     type: 'BufferArray',
                     length: buffer.length,
                     index: index,
                  };
               });
            } else {
               // 普通数组处理
               tranferedData[key] = {
                  type: 'Array',
                  items: value.map((item) => {
                     if (typeof item === 'object' && item !== null) {
                        const { tranferedData: nestedData } =
                           this.extractBuffer(item, buffers);
                        return nestedData;
                     }
                     return item;
                  }),
               };
            }
         } else if (typeof value === 'object' && value !== null) {
            const { tranferedData: nestedData } = this.extractBuffer(
               value,
               buffers
            );
            tranferedData[key] = nestedData;
         } else {
            tranferedData[key] = value;
         }
      });

      return { tranferedData, buffers };
   }

   /**
    * 从传输的数据和 Buffer 重新组装原始数据结构。
    * 它通过用实际的 Buffer 实例替换元数据来重建原始对象。
    *
    * @param tranferedData 包含 Buffer 元数据的传输数据。
    * @param buffers 用于重建的 Buffer 数组。
    * @returns 重新组装的原始数据结构。
    */
   private reassembleBuffer(
      tranferedData: Record<string, any>,
      buffers: Buffer[]
   ): Record<string, any> {
      const result: Record<string, any> = {};

      Object.entries(tranferedData).forEach(([key, value]) => {
         if (typeof value === 'object' && value !== null) {
            if (value.type === 'Buffer') {
               result[key] = buffers[value.index];
            } else if (value.type === 'Array') {
               // 重建普通数组
               result[key] = value.items.map((item: any) => {
                  if (typeof item === 'object' && item !== null) {
                     return this.reassembleBuffer(item, buffers);
                  }
                  return item;
               });
            } else if (
               Array.isArray(value) &&
               value.every((item) => item.type === 'BufferArray')
            ) {
               result[key] = value.map((item) => buffers[item.index]);
            } else {
               result[key] = this.reassembleBuffer(value, buffers);
            }
         } else {
            result[key] = value;
         }
      });

      return result;
   }

   /**
    * 从数据结构中提取 Buffer 元数据。
    * 它递归遍历数据以找到所有 Buffer 及其元数据。
    *
    * @param data 要提取 Buffer 元数据的数据。
    * @returns 包含每个 Buffer 索引和长度的对象数组。
    */
   private extractBufferInfo(
      data: any
   ): Array<{ index: number; length: number }> {
      const result: Array<{ index: number; length: number }> = [];

      const traverse = (obj: any) => {
         if (typeof obj === 'object' && obj !== null) {
            if (obj.type === 'Buffer') {
               result.push({ index: obj.index, length: obj.length });
            } else if (obj.type === 'Array') {
               // 遍历数组项
               obj.items.forEach(traverse);
            } else if (Array.isArray(obj)) {
               obj.forEach((item) => {
                  if (item.type === 'BufferArray') {
                     result.push({ index: item.index, length: item.length });
                  } else {
                     traverse(item);
                  }
               });
            } else {
               Object.values(obj).forEach(traverse);
            }
         }
      };

      traverse(data);
      return result;
   }

   /**
    * 将数据打包为适合传输的 Buffer 格式。
    * 它序列化JSON数据并将缓冲区附加到结果 Buffer。
    *
    * @param data 要打包的数据。
    * @returns 包含打包数据的Buffer。
    */
   pack(data: Record<string, any>) {
      const { tranferedData, buffers } = this.extractBuffer(data);

      const transferDataBuffer = Buffer.from(
         JSON.stringify(tranferedData),
         'utf8'
      );

      const buffersLength = buffers.reduce((acc, buf) => acc + buf.length, 0);

      const resultBuffer = Buffer.alloc(
         8 + transferDataBuffer.length + buffersLength
      );

      let offset = 0;
      resultBuffer.writeUInt32BE(transferDataBuffer.length, offset);
      offset += 4;

      transferDataBuffer.copy(resultBuffer, offset);
      offset += transferDataBuffer.length;

      buffers.forEach((buffer) => {
         buffer.copy(resultBuffer, offset);
         offset += buffer.length;
      });

      return resultBuffer;
   }

   /**
    * 从 Buffer 格式中解包数据。
    * 它从结果 Buffer 中提取JSON数据和缓冲区。
    *
    * @param buffer 包含打包数据的缓冲区。
    * @returns 解包后的数据。
    */
   unpack(buffer: Buffer) {
      let offset = 0;

      const jsonLength = buffer.readUInt32BE(offset);
      offset += 4;

      const transferDataBuffer = buffer.subarray(offset, offset + jsonLength);
      offset += jsonLength;

      const tranferedData = JSON.parse(transferDataBuffer.toString('utf8'));

      // 重构buffers数组
      const buffers: Buffer[] = [];
      const remainingBuffer = buffer.subarray(offset);
      let bufferOffset = 0;

      // 需要按照索引顺序重建buffers数组
      const bufferInfo = this.extractBufferInfo(tranferedData);
      bufferInfo.sort((a, b) => a.index - b.index);

      bufferInfo.forEach((info) => {
         buffers[info.index] = remainingBuffer.subarray(
            bufferOffset,
            bufferOffset + info.length
         );
         bufferOffset += info.length;
      });

      return this.reassembleBuffer(tranferedData, buffers);
   }
}

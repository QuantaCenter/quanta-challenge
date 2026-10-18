import sharp from 'sharp';

import { buildCoverSvg, type CoverSpec } from '../domain/cover';

/** 把封面描述光栅化成 PNG。 */
export const renderCoverPng = async (spec: CoverSpec): Promise<Buffer> =>
   sharp(Buffer.from(buildCoverSvg(spec), 'utf8'))
      .png()
      .toBuffer();

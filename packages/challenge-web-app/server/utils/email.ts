import nodemailer from 'nodemailer';
import { logger } from '~~/lib/logger';

const { account, smtpPassword } = useRuntimeConfig().email;
const transporter = nodemailer.createTransport({
   host: 'smtpdm.aliyun.com',
   port: 465,
   secure: true,
   auth: {
      user: account,
      pass: smtpPassword,
   },
});

export type SendEmailResult =
   | { success: true; id: string }
   | { success: false; reason: string };

/** 发送邮件：成功返回 `{ success: true, id }`，失败返回 `{ success: false, reason }`。 */
export const sendEmail = async (props: {
   to: string;
   subject: string;
   html: string;
   from?: { name?: string; address?: string } | string;
}): Promise<SendEmailResult> => {
   const { to, subject, html, from } = props;

   const result = await transporter.sendMail({
      from: formatEmailAddress(from ?? {}),
      to,
      subject,
      html,
   });

   logger.info({ to, result }, 'Email sent');

   if (result.messageId) {
      return {
         success: true,
         id: result.messageId,
      };
   } else {
      return {
         success: false,
         reason: result.rejected.join(', '),
      };
   }
};

const formatEmailAddress = (
   from: { name?: string; address?: string } | string,
) => {
   if (typeof from === 'string') {
      return from;
   }

   const {
      name = 'Quanta 前端挑战',
      address = 'noreply@challenge.quantacenter.com',
   } = from;
   return `"${name}" <${address}>`;
};

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForgeOps · CI/CD 发布控制中心",
  description: "智能客服项目的发布、回滚、服务器与模型运行状态控制台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

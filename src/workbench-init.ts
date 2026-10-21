// @internal/workbench-elements 的宿主注入（2026-10-21 收 0.1.3，总账 #2）：包里的 popup-menu / notice 不再 import 宿主的布局模块，
//   「顶栏下缘」「浮窗 / 停靠通知的顶地板」经 configureFloors 注入（host-floors.ts）。app.ts 紧跟 gallery-pkg-init 之后 import，
//   任何 popup 开之前生效；getter 现算，不怕 import 顺序。
//   以前 anchored-popup.ts 直接 import ui/context-toolbar、notice.ts 直接 import floating-window——那是宿主布局知识，包不能有。
import { configureFloors } from "@internal/workbench-elements";
import { contextToolbarBottom } from "./ui/context-toolbar.ts";
import { floatingTopFloor } from "./ui/floating-window.ts";
configureFloors({ toolbarBottom: () => contextToolbarBottom(), floatingTop: () => floatingTopFloor() });

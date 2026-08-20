# 每日一题题库来源

每日一题不再在线生成题目。维护脚本从以下固定版本的数据集导入题干、四个选项和标准答案；DeepSeek 仅在维护阶段复核答案并生成解析。只有审核通过且解析已写入数据库的题目才能被每日抽取。

## LogiQA 2.0

- 项目：<https://github.com/csitfun/logiqa2.0>
- 固定版本：`955e1d3df6c59d9bfb44d9913da1e1a27ec14e18`
- 使用内容：中文 MRC 数据中的材料、问题、选项和答案
- 许可证：Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International（CC BY-NC-SA 4.0）
- 许可证全文：<https://creativecommons.org/licenses/by-nc-sa/4.0/>

## CMMLU

- 项目：<https://huggingface.co/datasets/lmlmcat/cmmlu>
- 固定版本：`d6e7b716d8ac694f38969a6c0407437d1fded799`
- 使用内容：`chinese_civil_service_exam` 分类中的问题、选项和答案
- 数据集页面标注许可证：Creative Commons Attribution-NonCommercial 4.0 International（CC BY-NC 4.0）
- 许可证全文：<https://creativecommons.org/licenses/by-nc/4.0/>

## RAVEN 风格程序化图推

- 启发来源：<https://github.com/WellyZhang/RAVEN>
- 固定生成器版本：`deterministic-rule-v1`
- 使用内容：项目内生成的 3×3 图形矩阵、四个图形选项、标准答案和规则解析
- 规则类型：数量相加、形状递进、箭头旋转、位置对称
- 说明：不下载、不复制也不重新分发原始 RAVEN 数据集文件；图形由本项目的确定性规则生成

LogiQA 2.0 与 CMMLU 仅用于非商业场景。若项目以后收费、商业发行或将题库用于商业服务，必须先取得单独授权或替换为拥有商业使用权的题库。

导入脚本不会在程序运行时抓取题目；它只在管理员主动执行时从上述固定版本下载数据并写入本地数据库。数据源内容更新不会自动进入题库，必须修改固定版本并重新审核。

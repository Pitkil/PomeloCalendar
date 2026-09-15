# 单页面网页版

直接打开 `index.html` 或运行 `python -m http.server 8080`。

功能：月历/周课表、课表文件导入（JSON/CSV/TXT/制表符）、导入后课程编辑、日程管理、校园记账、可自定义番茄钟、壁纸主题、本地备份与 ICS 导出。

课表导入：先打开 [西大办事大厅](https://ywtb.swu.edu.cn/new-office-hall-pc/index.html#/)，进入“教务系统/我的课表”并导出 PDF；在页面右上角“⇩”选择 PDF，系统会先提取文字并放入编辑框供检查。也支持 CSV、JSON、TXT 或直接粘贴表格文本。所有解析在浏览器本机完成，不需要账号密码，也不会上传数据。

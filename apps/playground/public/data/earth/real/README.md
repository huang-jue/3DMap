# 真实 GFS 风场与 CAMS PM2.5 离线快照

从 earth.nullschool.net 的公开数据服务下载，模型来源为 NOAA/NCEP Global Forecast System。
PM2.5 来源为 Copernicus Atmosphere Monitoring Service（CAMS）/ ECMWF，使用参考网站同类的真实浓度预报。
这是固定预报演示数据，不是实时天气观测。其他六种模式的合成数据位于上级目录，菜单中单独选择。

- 下载日期：2026-10-27。
- 模型起报：2026-10-26 18:00 UTC。
- 有效时刻：2026-10-27 01:00、03:00、06:00 UTC（北京时间 09:00、11:00、14:00）。
- 高度：地表上方 10 米。
- 原始网格：0.5°，720 × 361。项目网格：721 × 361，包含一个重复经度端点；未通过上采样伪造更高精度。
- `wind.json`：原始 U/V 分量转换后的南到北、西到东网格；单位 m/s。
- `speed.json`：由同一 U/V 分量计算的风速色层。
- `raw/`：保留下载的 EPak 原件和海岸线 TopoJSON。
- `provenance.json`：原始下载地址、模型时间、有效时间、SHA-256、机构与转换历史。
- `coastline.json`：从站点 `earth-topo.json` 中提取的 Natural Earth `coastline_110m` 线。

## PM2.5

- 进入「地球模式 → 颗粒物 · PM2.5」，或直接打开 Playground 的 `/?earth=pm25`。
- `pm25.json`：0.4° 原始网格 900 × 451 转为 901 × 451，末列为重复的经度接缝；保留原始浓度空间分辨率。
- 三个有效时间与 GFS 风场完全一致：2026-10-27 01:00、03:00、06:00 UTC。
- 单位从原始 `kg m**-3` 乘以 `1e9` 转为 `µg/m³`；数值保留三位小数。
- 1–1000 µg/m³ 对数色阶，蓝色低浓度、青绿过渡、黄色至红色高浓度。低于 1 的值使用色阶底色，点查保留真实数值。
- 默认使用正交球面与 GFS 10 m 风流线；菜单可选择仅浓度色层。流线表示风，浓度色层表示 PM2.5。
- 时间轴连续驱动风分量插值；浓度使用最近的真实预报帧，数据卡显示实际色层时间。
- 各原件的下载地址、模型起报时间、单位换算与 SHA-256 见 `provenance.json` 的 `particulate` 字段。
- 这是固定预报快照；参考网站的实时页面会继续更新，因此具体污染分布随有效时刻不同。

从项目根目录运行 `node scripts/import-earth-snapshot.mjs` 可离线重新转换。
运行 `node --test scripts/earth/snapshot.test.mjs` 可验证完整性、行序、接缝与风速计算。

原始数据分发地址：

- https://gaia.nullschool.net/data/gfs/current/current-wind-surface-level-gfs-0.5.epak
- https://gaia.nullschool.net/data/gfs/2026/10/27/0300-wind-surface-level-gfs-0.5.epak
- https://gaia.nullschool.net/data/gfs/2026/10/27/0600-wind-surface-level-gfs-0.5.epak
- https://earth.nullschool.net/earth-topo.json

`current` 地址会变化；复现这份演示时应使用仓库内保留的原件及校验和。

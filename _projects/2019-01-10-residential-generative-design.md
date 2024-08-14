---
layout: project

title: Residential Planning Generative Design
subtitle: 住区生成设计
team: [ Baizhou Zhang, Xugang Chen, Biao Li, Hao Hua ]
location:
featured-image: https://archialgo-com-sources.oss-cn-hangzhou.aliyuncs.com/images/2020-09-25-mas-dijkstra-residential-union.jpg
---

<br>

![](https://archialgo-com-sources.oss-cn-hangzhou.aliyuncs.com/images/2020-09-25-mas-dijkstra-residential-union.jpg)

本项目为东南大学建筑学院建筑设计课题。

设计过程：
1. 根据消防间距、日照间距、临边规则、集聚规则等，对建筑单元编写多智能体运动规则。
2. 在场地中布置若干建筑单元，迭代至稳态，得到布局点位。
3. 预设若干户型模板，在点位上自动生成户型平面轮廓。
4. 将户型平面轮廓的关键顶点提取出来，在整个场地中生成Voronoi剖分。
5. 将同一建筑单元所属的剖分图元进行合并，得到每栋建筑的地块占据。
6. 指定场地的出入口，使用Dijkstra算法在地块网格上生成出入口到各个楼宇的最短路径。
7. 提取网格上路径叠加较多的线段，组成住区内的多级道路。

This project is a design task within the architecture program at Southeast University.

Design Process:
1. Develop rules for the movement of multiple agents based on factors such as fire spacing, sunlight spacing, edge
regulations, and clustering rules for building units.
2. Arrange several building units in the site, iterate to stability, and obtain layout positions.
3. Preset several template floor plans, automatically generate floor plan outlines on the designated positions.
4. Extract key vertices from the floor plan outlines, generate Voronoi tessellation across the entire site.
5. Merge tessellation elements belonging to the same building unit to obtain the land occupation for each building.
6. Designate entry and exit points for the site, use the Dijkstra algorithm to generate the shortest paths from entry and
exit points to various buildings on the grid.
7. Extract line segments with significant overlap in the grid paths, forming multi-level roads within the residential area.

---

![](https://archialgo-com-sources.oss-cn-hangzhou.aliyuncs.com/images/2020-09-25-mas-dijkstra-residential-fig10.jpg)
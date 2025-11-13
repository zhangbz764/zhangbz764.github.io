---
layout: default
title: "About"
permalink: /about/
---

<h1 class="subpage-title">{{page.title}}</h1>
<div class="post-line"></div>

## Education

* **PhD candidate**, School of Architecture, Southeast University, _2022 - Present_
* **Master of Architecture _(Transferred to PhD program)_**, School of Architecture, Southeast University, _2020 - 2022_
* **Bachelor of Architecture**, School of Architecture, Southeast University, _2015 - 2020_

## Awards & Honors
<ul style="margin-bottom: 0">
  <li><strong>Southeast University “Zhishan” Scholarship for PhD Students</strong><br>
    东南大学博士研究生至善奖学金<br><em>2025</em></li>
  <li><strong>Southeast University Outstanding Individual in Academic Innovation</strong><br>
    东南大学学术创新先进个人<br><em>2025</em></li>
  <li><a href="https://caadria2024.org/young-caadria-award/" target="_blank"><strong>Young CAADRIA Award</strong></a><br><em>2024</em></li>
  <li><strong>"Li Ce & Guo Zhe" Digital Design Scholarship</strong>, SEU Education Foundation<br>
    东南大学教育基金会 李策郭喆数字设计奖学金<br><em>2024</em></li>
</ul>
<div id="awards-more-wrapper" style="overflow: hidden; max-height: 0; transition: max-height 0.6s ease;">
  <ul style="margin-bottom: 0">
    <li><strong>Huajian Cup - Excellent graduation design of School of Architecture, SEU, 2nd prize</strong><br>
      华建杯-东南大学建筑学院优秀毕业设计 二等奖<br><em>2020</em></li>
    <li><a href="https://jyt.jiangsu.gov.cn/art/2019/11/29/art_58320_8830110.html" target="_blank">
      <strong>The Fifth College Students' "Internet+" Innovation and Entrepreneurship Competition of Jiangsu Province, 3rd prize</strong><br>
      第五届江苏省“互联网+”大学生创新创业大赛 三等奖</a><br><em>2019</em></li>
    <li><a href="https://mp.weixin.qq.com/s/CGAgZolizSUpwOK2aUHU1g" target="_blank">
      <strong>2019 International University SNOW CONSTRUCTION COMPETITION, 3rd prize</strong><br>
      2019国际高校雪构建造节 三等奖</a><br><em>2019</em></li>
    <li><a href="https://mp.weixin.qq.com/s/W18nk_L7iyhW81VjW4LuRw" target="_blank">
      <strong>“CSCEC Strait Cup” The Fourth Cross-Strait College Students Construction Competition, 3rd prize</strong><br>
      “中建海峡杯”第四届海峡两岸大学生实体建构大赛 铜奖</a><br><em>2017</em></li>
  </ul>
</div>

<div style="text-align: center; margin-top: 5px; margin-bottom: 10px">
  <a id="toggle-awards" href="javascript:void(0);" onclick="toggleAwards()" style="font-size: 14px; color: #007acc; text-decoration: none;">
    ▼ More
  </a>
</div>

## Grants & Funding

* **SEU Innovation Capability Enhancement Plan for Doctoral Students** (Grant No. CXJH\_SEU 25057)  
  东南大学博士研究生创新能力提升计划  
  _Project Investigator, 2025 - 2026 (Ongoing)_
* **Postgraduate Research & Practice Innovation Program of Jiangsu Province** (Grant No. KYCX24\_0418)  
  江苏省研究生科研与实践创新计划项目  
  _Project Investigator, 2024 - 2026 (Ongoing)_
* **Postgraduate Research & Practice Innovation Program of Jiangsu Province** (Grant No. SJCX21\_0025)  
  江苏省研究生科研与实践创新计划项目  
  _Project Investigator, 2021 - 2023 (Completed)_

## Working Experiences

* **Assistant Architect (Internship)**, _Jun 2019 - Oct 2019_     
  <a href="https://adri.seu.edu.cn/main.htm" target="_blank">AESEU (Architecture and Engineering Co. Ltd. of Southeast
  University</a>, Nanjing, China
    * Participated in the design and construction
      of [Sichuan Dayi Country Ecology Museum & Moiré Pattern Dynamic Wall](../projects/2019-10-01-moire-wall).
    * Developed parametric algorithms with **Java & Rhinoceros** to create visual effects for the double-layer "Moiré
      Wall", implementing a geometric interference principle to achieve dynamic optical
      illusions. ([Patented](../publications/2025-03-13-moire-wall-patent))
    * Automated generation and output of CNC graphic files through computer programming, establishing a complete digital
      chain from parametric design to digital fabrication.

## Peer Review Activities

I have served as a peer reviewer for the following journals and conferences:

* Frontiers of Architectural Research
* Scientific Reports
* URBAN DESIGN International
* CAADRIA


<script>
function toggleAwards() {
  var wrapper = document.getElementById("awards-more-wrapper");
  var link = document.getElementById("toggle-awards");
  if (wrapper.style.maxHeight === "0px" || wrapper.style.maxHeight === "") {
    wrapper.style.maxHeight = "800px";
    link.innerHTML = "▲ Less";
  } else {
    wrapper.style.maxHeight = "0px";
    link.innerHTML = "▼ More";
  }
}
</script>
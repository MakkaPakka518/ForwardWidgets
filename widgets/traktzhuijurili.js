// 严格遵循 basic-widget.md 定义元数据
WidgetMetadata = {
  id: "trakt.tv.calendar.strict",
  title: "全球追剧日历Tramt",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "Trakt追剧日历",
  version: "4.0.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "追剧日历",
      functionName: "loadTvCalendar",
      type: "list", // 明确指定列表类型
      requiresWebView: false,
      params: [
        // 1. API Key - 放在最前，方便用户填写
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "必须填写才能获取数据",
        },
        // 2. 时间模式
        {
          name: "mode",
          title: "时间范围",
          type: "enumeration",
          value: "update_today",
          enumOptions: [
            { title: "今日更新 (Update Today)", value: "update_today" },
            { title: "明日首播 (Premiere Tomorrow)", value: "premiere_tomorrow" },
            { title: "7天内首播 (Next 7 Days)", value: "premiere_week" },
            { title: "30天内首播 (Next 30 Days)", value: "premiere_month" }
          ]
        },
        // 3. 地区选择 (含 Global)
        {
          name: "region",
          title: "地区偏好",
          type: "enumeration",
          value: "Global",
          enumOptions: [
            { title: "全球聚合 (Global)", value: "Global" },
            { title: "美国 (US)", value: "US" },
            { title: "日本 (JP)", value: "JP" },
            { title: "韩国 (KR)", value: "KR" },
            { title: "中国 (CN)", value: "CN" },
            { title: "英国 (GB)", value: "GB" }
          ]
        }
      ]
    }
  ]
};

/**
 * 核心加载函数
 * 遵循 data-formats.md 返回 WidgetItem 数组
 */
async function loadTvCalendar(params = {}) {
  // 1. 安全检查 API Key
  const apiKey = params.apiKey;
  if (!apiKey) {
    return [{
      id: "error_no_key",
      title: "❌ 配置缺失",
      subTitle: "请在设置中填入 TMDB API Key",
      type: "text", // 使用纯文本类型显示错误
      url: "" // 防止点击报错
    }];
  }

  const mode = params.mode || "update_today";
  const region = params.region || "Global";

  // 2. 计算日期 (YYYY-MM-DD)
  const dates = calculateDates(mode);
  
  // 3. 确定查询字段 (首播 vs 更新)
  const isPremiere = mode.includes("premiere");
  const dateField = isPremiere ? "first_air_date" : "air_date";

  // 4. 构建 TMDB Discover URL
  let url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&sort_by=popularity.desc&include_null_first_air_dates=false&page=1&timezone=Asia/Shanghai&${dateField}.gte=${dates.start}&${dateField}.lte=${dates.end}`;

  // 5. 地区与语言逻辑
  if (region === "Global") {
    // 全球模式：不限产地，但优先请求中文，方便阅读
    url += `&language=zh-CN`;
  } else {
    // 特定地区：限制产地 + 限制原声语言 (保证数据纯净)
    url += `&language=zh-CN&with_origin_country=${region}`;
    
    // 智能语言锁定
    const langMap = { "JP": "ja", "KR": "ko", "CN": "zh", "GB": "en", "US": "en" };
    if (langMap[region]) {
        url += `&with_original_language=${langMap[region]}`;
    }
  }

  console.log(`[Calendar] Request: ${url}`);

  try {
    const res = await Widget.http.get(url);
    const data = res.data || res;

    if (!data.results || data.results.length === 0) {
      return [{
        id: "empty_result",
        title: "📅 暂无更新",
        subTitle: `${region} 在 ${dates.start} 无数据`,
        type: "text"
      }];
    }

    // 6. 数据映射 (严格遵循 data-formats.md)
    return data.results.map(item => {
      // 标题回退逻辑：优先 name (中文)，其次 original_name (原文)
      const displayName = item.name || item.original_name;
      const dateStr = item[dateField] || "待定";
      
      // 构造前缀
      const prefix = mode === "update_today" ? "🆕" : `📅 ${dateStr.slice(5)}`;

      return {
        // 必须字段
        id: String(item.id), // ID 必须是字符串
        type: "tmdb",        // 类型必须明确
        
        // TMDB 特有字段 (用于 Emby 跳转)
        tmdbId: parseInt(item.id), // SKILL.md: 必须是数字
        mediaType: "tv",
        
        // 展示字段
        title: `${prefix} | ${displayName}`,
        subTitle: item.original_name !== displayName ? item.original_name : (item.overview || ""),
        
        // 图片 (使用完整 URL)
        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
        
        // 辅助信息
        rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
        year: (item.first_air_date || "").substring(0, 4)
      };
    });

  } catch (e) {
    console.error(e);
    return [{
      id: "error_network",
      title: "❌ 网络错误",
      subTitle: e.message || "请求失败",
      type: "text"
    }];
  }
}

// 日期计算工具 (纯函数)
function calculateDates(mode) {
  const today = new Date();
  const toStr = (d) => d.toISOString().split('T')[0];

  if (mode === "update_today") {
    return { start: toStr(today), end: toStr(today) };
  }
  
  if (mode === "premiere_tomorrow") {
    const tmr = new Date(today);
    tmr.setDate(today.getDate() + 1);
    return { start: toStr(tmr), end: toStr(tmr) };
  }
  
  if (mode === "premiere_week") {
    const start = new Date(today);
    start.setDate(today.getDate() + 1); // 从明天开始
    const end = new Date(today);
    end.setDate(today.getDate() + 7);
    return { start: toStr(start), end: toStr(end) };
  }
  
  if (mode === "premiere_month") {
    const start = new Date(today);
    start.setDate(today.getDate() + 1);
    const end = new Date(today);
    end.setDate(today.getDate() + 30);
    return { start: toStr(start), end: toStr(end) };
  }
  
  return { start: toStr(today), end: toStr(today) };
}

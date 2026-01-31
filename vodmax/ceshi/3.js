/**
 * TMDB 榜单插件 (修正版：支持类型标签显示)
 */

var WidgetMetadata = {
  id: "tmdb_final_strd",
  title: "TMDB 影视榜单",
  author: "Gemini",
  version: "1.0.5",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "全球热门趋势",
      functionName: "loadTrending",
      type: "video",
      params: [{ name: "page", title: "页码", type: "page", startPage: 1 }]
    }
  ]
};

// 1. 类型映射表 (从你提供的代码中提取)
const GENRE_MAP = {
  28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
  18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "惊悚", 10402: "音乐", 
  9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视", 53: "惊悚", 
  10752: "战争", 37: "西部", 10759: "动作冒险", 10765: "科幻奇幻"
};

async function loadTrending(params) {
  try {
    const response = await Widget.tmdb.get("trending/all/week", {
      params: { language: "zh-CN", page: params.page || 1 }
    });
    return formatItems(response.results);
  } catch (e) {
    console.error("加载失败: " + e.message);
    return [];
  }
}

function formatItems(results) {
  if (!results) return [];

  return results.map(item => {
    const dateStr = item.release_date || item.first_air_date || "";
    const year = dateStr.substring(0, 4);
    
    // 2. 获取类型文字 (取前两个类型)
    const genreText = (item.genre_ids || [])
      .map(id => GENRE_MAP[id])
      .filter(Boolean)
      .slice(0, 2)
      .join(" / ");

    return {
      id: item.id.toString(),
      type: "tmdb",
      title: item.title || item.name,
      
      // --- 关键字段修正 ---
      // 将 [年份 • 类型] 放入 genreTitle，FW 横版 UI 专门读取这个字段显示标签
      genreTitle: [year, genreText].filter(Boolean).join(" • "), 
      
      // 副标题依然保持具体日期，满足你对竖版 UI 的要求
      description: dateStr, 
      
      // 元数据供内核自动排版
      releaseDate: dateStr,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      rating: item.vote_average,
      mediaType: (item.media_type === "tv" || item.name) ? "tv" : "movie"
    };
  });
}

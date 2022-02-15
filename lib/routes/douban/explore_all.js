const got = require('@/utils/got');
const cheerio = require('cheerio');

module.exports = async (ctx) => {
    const response = await got({
        method: 'get',
        url: 'https://www.douban.com/explore',
    });

    const data = response.data;

    const $ = cheerio.load(data);
    const list = $('div.item');

    const list_pre = list.map((_, item) => {
        item = $(item);

        const haveItemPic = item.find('a.cover').attr('style');
        const itemPicHtml = haveItemPic
            ? `<img src=${
                  item
                      .find('a.cover')
                      .attr('style')
                      .match(/\('(.*?)'\)/)[1]
              }>`
            : '';

        const title = item.find('.title a').first().text() ? item.find('.title a').first().text() : '#' + item.find('.icon-topic').first().text();
        const desc = item.find('.content p').first().text();
        const author = item.find('.usr-pic a').last().text();//if use first(), it will return empty
        const link_pre = item.find('.title a').first().attr('href') ? item.find('.title a').first().attr('href') : item.find('.icon-topic a').first().attr('href');
        const link = item.find('.actions a').first().attr('href') ? item.find('.actions a').first().attr('href') : link_pre;
        
        const info ={
            title,
            author,
            description: `作者：${author}<br>描述：${desc}<br>${itemPicHtml}`,
            link,
        }
        return info;
    }).get()

    const out = await Promise.all(
        list_pre.map(async (info) => {
            const title = info.title;
            const author = info.author;
            const itemUrl = info.link;
            const description_pre = info.description;

            const response = await got.get(itemUrl);
            const $ = cheerio.load(response.data);

            const comments = $('li.comment-item', '#comments'); 
            // const comments = $('li.comment-item.reply-item', '#comments'); //for .comment-item reply-item should be changed to .comment-item.reply-item
            //use comments.length to see array length

            const comment_all = comments.map((_, item) => {
                item = $(item);

                const pubtime = item.find('span.pubtime').first().text();
                const author_each = item.find('div.user-face img').first().attr('alt');
                const quote = item.find('.reply-quote-content span.all').first().text();
                const content = item.find('p.reply-content').first().text();
                
                return pubtime + '||||' + author_each + '||||' + quote + '||||' + content;
            }).get()

            const contents = $('#topic-content');
            //use contents.find('div.rich-content').children()[3] to debug which child div or p

            const pubtime_content = contents.find('span.create-time').first().text();

            // const author_new = contents.find('div.user-face img').first().attr('alt');

            const content_all = contents.find('div.rich-content').children();
            //use children to deal with div and a for img and text!!!

            // const content_combine = content_all.map((_, item) => {
            //     if (item.name == 'div'){
            //         return $(item).find('img').first().attr('src');
            //     }
            //     else{
            //         return $(item).text();
            //     }
            // }).get()

            var content_combine=[];
            //to cooperate with multiple img within one div like stauts-saying
            content_all.map((_, item) => {
                var insert_tag = 0;
                $(item).find('p').each((_, item_second) => {
                    content_combine.push($(item_second).text());
                    insert_tag = 1;
                });
                $(item).find('img').each((_, item_second) => {
                    content_combine.push($(item_second).attr('src'));
                });
                if (item.attribs['class'] != null){
                    if (item.attribs['class'].includes('icon-topic')){
                        $(item).find('a').each((_, item_second) => {
                            content_combine.push($(item_second).text());
                        });
                    }
                }                
                if (item.name == 'p' && insert_tag == 0){
                    content_combine.push($(item).text());
                }
            })

            if (pubtime_content != '' || content_combine.toString() != '' || comment_all.length > 0){
                const single = {
                    title,
                    link: itemUrl,
                    description: pubtime_content + '||||||||||||' + content_combine.join('||||||||') + '||||||||||||' + comment_all.join('||||||||'),
                    author,
                };
                return Promise.resolve(single);
            }
            else {

                const comments_script = $('script');
                var comment_script = '';
                for (var i = 0; i < comments_script.length; i++){
                    if ($(comments_script[i]).html().includes('var _COMMENTS_CONFIG') ){
                        comment_script = $(comments_script[i]).html()
                    }
                }

                // const comment_script_final = comment_script.match(/^var([\s\S]+)};/g);
                //const comment_script_final = comment_script.match(/var _COMMENTS_CONFIG([\s\S]+)};/g)[0];
                var comment_script_final = '';
//                 if (comment_script.match(/var _COMMENTS_CONFIG([\s\S]+)};/g) !== null){  //avoid Cannot read property '0' of null
//                     comment_script_final = comment_script.match(/var _COMMENTS_CONFIG([\s\S]+)};/g)[0];
//                     eval(comment_script_final);
//                 }
                try {
                    comment_script_final = comment_script.match(/var _COMMENTS_CONFIG([\s\S]+)};/g)[0];
                    eval(comment_script_final);
                } catch (e) {
                    console.log('出错了：' + e);
                } finally {
                    console.log('finally');
                }

                var comment_content=[];
                if (typeof _COMMENTS_CONFIG !== 'undefined') {
                    for (var i = 0; i < _COMMENTS_CONFIG['comments'].length; i++){
                        const pubtime_new =  _COMMENTS_CONFIG['comments'][i]['create_time'];
                        const author_each_new =  _COMMENTS_CONFIG['comments'][i]['author']['name'];
                        const quote_new =  Object.keys(_COMMENTS_CONFIG['comments'][i]['ref_comment']).length ? _COMMENTS_CONFIG['comments'][i]['ref_comment']['text'] : '';
                        const content_new =  _COMMENTS_CONFIG['comments'][i]['text'];
                        comment_content.push(pubtime_new + '||||' + author_each_new + '||||' + quote_new + '||||' + content_new);
                        for (var j = 0; j < _COMMENTS_CONFIG['comments'][i]['replies'].length; j++){
                            const pubtime_reply =  _COMMENTS_CONFIG['comments'][i]['replies'][j]['create_time'];
                            const author_each_reply =  _COMMENTS_CONFIG['comments'][i]['replies'][j]['author']['name'];
                            const quote_reply =  Object.keys(_COMMENTS_CONFIG['comments'][i]['replies'][j]['ref_comment']).length ? _COMMENTS_CONFIG['comments'][i]['replies'][j]['ref_comment']['text'] : '';
                            const content_reply =  _COMMENTS_CONFIG['comments'][i]['replies'][j]['text'];
                            comment_content.push(pubtime_reply + '||||' + author_each_reply + '||||' + quote_reply + '||||' + content_reply);
                        }
                    }                   
                }

                const pubtime_content_new = $('div.pubtime').find('span').first().text();

                const content_all_new = $('div.status-saying').children();
                //use children to deal with div and a for img and text!!!

                var content_combine_new=[];
                //to cooperate with multiple img within one div like stauts-saying
                content_all_new.map((_, item) => {
                    var insert_tag_new = 0;
                    $(item).find('p').each((_, item_second) => {
                        content_combine_new.push($(item_second).text());
                        insert_tag_new = 1;
                    });
                    $(item).find('img').each((_, item_second) => {
                        content_combine_new.push($(item_second).attr('src'));
                    });
                    if (item.attribs['class'] != null){
                        if (item.attribs['class'].includes('icon-topic')){
                            $(item).find('a').each((_, item_second) => {
                                content_combine_new.push($(item_second).text());
                            });
                        }
                    }
                    if (item.name == 'p' && insert_tag_new == 0){
                        content_combine_new.push($(item).text());
                    }
                })

                if (pubtime_content != '' || content_combine.toString() != '' || comment_all.length > 0){
                    const single = {
                        title,
                        link: itemUrl,
                        description: pubtime_content_new + '||||||||||||' + content_combine_new.join('||||||||') + '||||||||||||' + comment_content.join('||||||||'),
                        author,
                    }; 
                    return Promise.resolve(single);
                }
                else{
                    const single = {
                        title,
                        link: itemUrl,
                        description: description_pre + '||||||||||||' + response.data,
                        author,
                    };
                    return Promise.resolve(single);
                }
            }
        })
    );

    ctx.state.data = {
        title: '豆瓣-浏览发现',
        link: 'https://www.douban.com/explore',
        item: out,
    };
};

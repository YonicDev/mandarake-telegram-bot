require("babel-core/register");
require("babel-polyfill");

const mandarakeSearch = require('mdrscr').default;
const {mainCategories} = require('mdrscr');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const removeHTML = require('striptags');

const token = process.env.MANDARAKE_BOT_KEY;
const bot = new TelegramBot(token,{polling:true});

var users;
fs.readFile("./usersList.json",(err,data) => {
    if(err) {
        console.log(err);
        users = {};
        fs.writeFile("./usersList.json",JSON.stringify(users),(err,data) => {
            if(err) {
                console.log(err);
            }
        });
    } else {
        users = JSON.parse(data);
    }
})

bot.onText(/\/start/, function(message) {
    users[message.from.id] = {
        tasks:[],
        search_results:{
            task:"",
            entries:[],
            count:0
        },
        blacklist:[],
        has_forced_check: false,
        is_adding_task: false,
        is_deleting_everything: false,
        is_performing_manual_search: false,
        editing_task: -1,
        is_adult: false
    }
    saveUsersList();
    bot.sendMessage(message.from.id,`Hello, ${message.from.first_name}! This is Yonic and Iwanko's Mandarake bot!\nThis bot automatically checks every 10 minutes if any doujinshi items you want.\nYou can get started with /taskstart.`).catch((e) => {
        console.log(e);
    });
})

bot.onText(/\/taskstart/, function(message) {
    bot.sendMessage(message.from.id,"Please write your search query for the task.").then(function() {
        users[message.from.id].is_adding_task = true;
    });
})

bot.onText(/\/tasklist/, function(message) {
    var text;
    if(users[message.from.id].tasks.length>0) {
        text = "Here is a list of all your tasks:\n";
        users[message.from.id].tasks.forEach(function (task, i) {
            text+=`${i}: ${task}\n`;
        })
        text+="\nTo edit them, use /taskedit number_of_task,\nTo delete them, use /taskdelete number_of_task."
    } else {
        text = "You have no tasks set. To add one, use /taskstart."
    }
    bot.sendMessage(message.from.id,text);
})

bot.onText(/\/taskedit ?(\d*) ?(.*)/,function(message,matches) {
    if(matches[1]) {
        if(matches[2]) {
            bot.sendMessage(message.from.id,`Task succesfully edited!`).then(function() {
                users[message.from.id].tasks[matches[1]] = matches[2];
                saveUsersList();
            });
        } else {
            bot.sendMessage(message.from.id,`Type the new query you want to set.`).then(function() {
                users[message.from.id].editing_task = parseInt(matches[1]);
            });
        }
    } else {
        var text = "You must specify a number representing one of these tasks:\n"
        users[message.from.id].tasks.forEach(function (task, i) {
            text+=`${i}: ${task}\n`;
        })
        bot.sendMessage(message.from.id,text);
    }
})
bot.onText(/\/taskdelete (\d+|all)/,function(message,matches) {
    if(matches[1] == "all") {
        const settings = {
            reply_markup: {
                keyboard: [
                    ["DELETE EVERYTHING!","No! Back up! Back up!"],
                ],
            }
        }
        bot.sendMessage(message.from.id,`Are you sure you want to delete every task?`,settings).then(function() {
            users[message.from.id].is_deleting_everything = true;
        });
    } else {
        bot.sendMessage(message.from.id,`The task ${users[message.from.id].tasks[matches[1]]} has been deleted!`).then(function() {
            users[message.from.id].tasks.splice(matches[1],1);
            saveUsersList();
        });
    }
})

bot.onText(/\/search ?(\d|all)?/,function(message,matches) {
    if(matches[1] == "all") {
        var botMessage;
        users[message.from.id].is_performing_manual_search = true
        bot.sendMessage(message.from.id,"Performing all tasks! Search results will be combined.").then((message) => {
            botMessage = message;
        });
        searchBulk(message.from.id);
    } else if(matches[1]!=undefined) {
        const options = {
            reply_markup: {
                remove_keyboard:true
            }
        };
        bot.sendMessage(message.from.id,`Performing task #${matches[1]}`,options).then(function() {
            searchTask(message.from.id,parseInt(matches[1]));
        });
    } else {
        var i,j,chunk = 4; //TODO: Make chunk variable?
        var buttons = [];
        for (i=0,j=users[message.from.id].tasks.length; i<j; i+=chunk) {
            buttons.push(users[message.from.id].tasks.slice(i,i+chunk));
        }
        buttons.unshift(["All tasks"]);
        const options = {
            reply_markup: {
                keyboard: buttons
            }
        }
        bot.sendMessage(message.from.id,`Choose the query to perform a search task from.\nKeep in mind that it will not interrupt the scheduled task.`,options).then(function() {
            users[message.from.id].is_performing_manual_search = true
        });
    }
})

bot.onText(/\/blacklist$/,function(message) {
    var blacklist = users[message.from.id].blacklist;
    if(blacklist!=undefined && blacklist.length > 0) {
        var text = "Showing your blacklisted items.\nYou can delete them by using the /blacklistdelete listing_number command.\n\n"
        for(index in blacklist) {
            text+=`${index}: ${blacklist[index]}\n`;
        }
        bot.sendMessage(message.chat.id,text);
    } else {
        bot.sendMessage(message.chat.id,"There is nothing in your blacklist.");
    }
});
bot.onText(/\/blacklistdelete (\d+|all)/,function(message,matches) {
    if(matches[1] == "all") {
        const settings = {
            reply_markup: {
                keyboard: [
                    ["Yes! I'll be fine!","No..."],
                ],
            }
        }
        bot.sendMessage(message.from.id,`Are you sure you want to delete every item in your blacklist?`,settings).then(function() {
            users[message.from.id].is_deleting_everything = true;
        });
    } else {
        bot.sendMessage(message.from.id,`The item number ${matches[1]} has been deleted from your list!`).then(function() {
            users[message.from.id].blacklist.splice(parseInt(matches[1]),1);
            saveUsersList();
        });
    }
})

bot.onText(/\/lastsearch/,function(message) {
    bot.sendMessage(message.from.id,"Retreiving last search information...").then(function() {
        var user = users[message.from.id];
        if(user.search_results!=undefined && user.search_results.count > 0) {
            bot.sendMessage(message.from.id,`Displaying ${user.search_results.count} items.\n(Will display only results added in 7 days)`).then(() => {
                var entry = user.search_results.entries[0];
                var options = getPagination(1,user.search_results.count);
                options.caption = `<b>Title</b>: ${entry.title}\n<b>Shop</b>: ${entry.shop}\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`;
                options.parse_mode = "HTML";
                bot.sendPhoto(message.from.id,entry.image,options).catch((err) => {
                    console.warn(err.message);
                    options.caption = `<i>The title could not be displayed.</i>\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`
                    bot.sendPhoto(user.id,entry.image,options);
                });
            });
        } else if(user.search_results.task!=undefined&&user.search_results.task!="") {
            bot.sendMessage(message.from.id,`Sorry, I haven't found any recent additions!\n\nI only display items that have been added within 7 days, so make sure you check Mandarake anyways! https://order.mandarake.co.jp/order/listPage/list?keyword=${user.search_results.task.replace(/ /,"_")}`);
        } else {
            bot.sendMessage(message.from.id,"No searches have been done recently.")
        }
    })
});


bot.onText(/\/im18yearsoldpleaseshowmehentai/, function(message) {
    bot.sendMessage(message.from.id,"Pervert! Now you can look for adult items. Browse carefully!").then(function() {
        users[message.from.id].is_adult = true;
        saveUsersList();
    });
})

bot.on('message',function(message) {
    if(users!=undefined&&Object.getOwnPropertyNames(users).length > 0&&users[message.from.id]!=undefined) {
        if(users[message.from.id].is_adding_task) {
            if(/.+/.test(message.text)) {
                if(users[message.from.id].tasks.indexOf(message.text)<0) {
                    users[message.from.id].tasks.push(message.text);
                    bot.sendMessage(message.from.id,"Your task has been added!").then(function() {
                        users[message.from.id].is_adding_task = false;
                        saveUsersList();
                    });
                } else {
                    bot.sendMessage(message.from.id,"That task is already on the list! Try again.");
                }
            } else {
                bot.sendMessage(message.from.id,"You can only use one line to put your query. Try again.");
            }
        }
        if(users[message.from.id].editing_task>=0) {
            if(/.+/.test(message.text)) {
                users[message.from.id].tasks[users[message.from.id].editing_task] = message.text;
                bot.sendMessage(message.from.id,"Task succesfully edited!").then(function() {
                    users[message.from.id].editing_task = -1;
                    saveUsersList();
                });
            } else {
                bot.sendMessage(message.from.id,"You can only use one line to put your query. Try again.");
            }
        }
        if(users[message.from.id].is_deleting_everything) {
            if(message.text === "DELETE EVERYTHING!") {
                users[message.from.id].tasks = [];
                const settings = {
                    reply_markup: {
                        remove_keyboard:true
                    }
                };
                bot.sendMessage(message.from.id,"KA-BOOM! All tasks have been deleted!",settings).then(function() {
                    users[message.from.id].is_deleting_everything = false;
                    saveUsersList();
                });
            } else if (message.text === "Yes! I'll be fine!") {
                users[message.from.id].blacklist = [];
                const settings = {
                    reply_markup: {
                        remove_keyboard:true
                    }
                };
                bot.sendMessage(message.from.id,"The blacklist has been whited out!",settings).then(function() {
                    users[message.from.id].is_deleting_everything = false;
                    saveUsersList();
                });
            }
        }
        if(users[message.from.id].is_performing_manual_search) {
            const options = {
                reply_markup: {
                    remove_keyboard:true
                }
            }
            if(message.text === "All tasks") {
                bot.sendMessage(message.chat.id,`Performing all tasks! Search results will be combined.`,options).then(function(botMessage) {
                    searchBulk(message.from.id);
                });

            } else {
                bot.sendMessage(message.from.id,`Performing task #${users[message.from.id].tasks.indexOf(message.text)}`,options).then(function() {
                     searchTask(message.from.id,users[message.from.id].tasks.indexOf(message.text));
                });
            }
        }
    }
});

bot.on('callback_query',function(callbackQuery) {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const opts = {
        chat_id: msg.chat.id,
        message_id: msg.message_id
    };
    var text;
    if(/page/.test(action)) {
        var entry = users[opts.chat_id].search_results.entries[parseInt(action.slice(4))-1];
        var image = {
            type:"photo",
            media:entry.image,
            caption: `<b>Title</b>: ${entry.title}\n<b>Shop</b>: ${entry.shop}\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`,
            parse_mode:"HTML"
        };

        var editOptions = Object.assign(getPagination(parseInt(action.slice(4)), users[opts.chat_id].search_results.count), opts);

        bot.editMessageMedia(image, editOptions).catch((err) => {
            if (msg.caption == removeHTML(image.caption))
                bot.answerCallbackQuery(callbackQuery.id);
            else {
                console.warn(err.message);
                editOptions.caption = `<i>The title could not be displayed.</i>\n<b>Shop</b>: ${entry.shop}\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`;
                bot.editMessageMedia(image, editOptions).catch((err) => {
                    bot.answerCallbackQuery(callbackQuery.id);
                });
            }
        });
    }
    if(/blacklist/.test(action)) {
        try {
            var index = parseInt(action.slice(9)-1);
            var productNumber = users[opts.chat_id].search_results.entries[index].itemNo;
            var user = users[opts.chat_id]
            user.search_results.entries.splice(index,1);
            user.search_results.count--;
            users[opts.chat_id].blacklist.push(productNumber[0]);
            saveUsersList();
            bot.sendMessage(opts.chat_id,"You blacklisted this item! It will not appear in any more searches.");
            var editOptions = Object.assign(getPagination(index+1, user.search_results.count), opts);
            var entry = user.search_results.entries[index];
            var image = {
                type:"photo",
                media:entry.image,
                caption: `<b>Title</b>: ${entry.title}\n<b>Shop</b>: ${entry.shop}\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`,
                parse_mode:"HTML"
            };
            bot.editMessageMedia(image, editOptions).catch((err) => {
                if (callbackQuery.message.caption == removeHTML(image.caption))
                    bot.answerCallbackQuery(callbackQuery.id);
                else {
                    console.warn(err.message);
                    editOptions.caption = `<i>The title could not be displayed.</i>\n<b>Shop</b>: ${entry.shop}\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`;
                    bot.editMessageMedia(image, editOptions).catch((err) => {
                        bot.answerCallbackQuery(callbackQuery.id);
                    });
                }
            }).finally(() => {
                bot.answerCallbackQuery(callbackQuery.id);
            });
        } catch (e) {
            console.log(e);
        }
    }
})

function searchTask(user_id,task_index) {
    var user = users[user_id];
    var task = {
        keyword: user.tasks[task_index],
        categoryCode: mainCategories.DOUJIN_EVERYTHING[0],
        soldOut: 1,
        dispAdult: user.isAdult,
        upToMinutes: 10080
    }

    mandarakeSearch(task,'ja').then((items) => {
        user.search_results.task = task.keyword;
        if(user.blacklist!=undefined&&user.blacklist.length>0) {
            for(var entry in items.entries) {
                for(var black in user.blacklist) {
                    if(items.entries[entry].itemNo[0] === user.blacklist[black]) {
                        items.entries.splice(entry,1);
                        items.entryCount--;
                    }
                }
            }
        }
        if(items!=undefined && items.entryCount > 0 && items.entries.length > 0) {
            user.search_results.entries = items.entries;
            user.search_results.count = items.entryCount;
            user.is_performing_manual_search = false;
            bot.sendMessage(user_id,`I've found ${user.search_results.count} items available to buy!\n(Will display only results added in 7 days)`).then(() => {
                var entry = user.search_results.entries[0];
                var options = getPagination(1,user.search_results.count);
                options.caption = `<b>Title</b>: ${entry.title}\n<b>Shop</b>: ${entry.shop}\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`;
                options.parse_mode = "HTML";
                bot.sendPhoto(user_id,entry.image,options).catch((err) => {
                    console.warn(err.message);
                    options.caption = `<i>The title could not be displayed.</i>\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`
                    bot.sendPhoto(user.id,entry.image,options);
                });
            });
        } else if(user.is_performing_manual_search) {
            bot.sendMessage(user_id,`Sorry, I haven't found any recent additions!\n\nI only display items that have been added within 7 days, so make sure you check Mandarake anyways! https://order.mandarake.co.jp/order/listPage/list?keyword=${user.search_results.task.replace(/ /,"_")}`).then(function() {
                user.is_performing_manual_search = false;
            });

        }
    });
}

function searchBulk(user_id) {
    var user = users[user_id];
    var task = {};
    var promises = [];
    var results = {
        entries:[],
        count:0
    };
    var i = 0;
    for(kword in user.tasks) {
        task = {
            keyword: user.tasks[kword],
            categoryCode: mainCategories.DOUJIN_EVERYTHING[0],
            soldOut: 1,
            dispAdult: user.isAdult,
            upToMinutes: 10080
        }

        promises.push(mandarakeSearch(task,"ja").then((items)=> {
            if(items!=undefined && items.entryCount > 0) {
                results.entries = results.entries.concat(items.entries);
                var obj = {};

                for ( var i=0, len=results.entries.length; i < len; i++ )
                    obj[results.entries[i]['itemNo']] = results.entries[i];

                results.entries = new Array();
                for ( var key in obj )
                    results.entries.push(obj[key]);
                results.count=results.entries.length;
            }
        }));
    }
    Promise.all(promises).then(()=> {
        user.search_results.task = "bulk search";
        if(results!=undefined && results.count > 0) {
            if(user.blacklist!=undefined&&user.blacklist.length>0) {
                for(var entry in results.entries) {
                    for(var black in user.blacklist) {
                        if(results.entries[entry].itemNo[0] === user.blacklist[black]) {
                            results.entries.splice(entry,1);
                            results.count--;
                        }
                    }
                }
            }
            user.search_results = results;
            if(user.search_results.count>0&&users.search_results.entries.length>0) {
                bot.sendMessage(user_id,`I've found ${user.search_results.count} items available to buy!\n(Will display only results added in 7 days)`).then(() => {
                    var entry = user.search_results.entries[0];
                    var options = getPagination(1,user.search_results.count);
                    options.caption = `<b>Title</b>: ${entry.title}\n<b>Shop</b>: ${entry.shop}\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`;
                    options.parse_mode = "HTML";
                    bot.sendPhoto(user_id,entry.image,options).catch((err) => {
                        console.warn(err.message);
                        options.caption = `<i>The title could not be displayed.</i>\n<b>Price</b>:${entry.price}\u00A5\n${entry.isAdult?"<b>This is an R-18 doujinshi.</b>":"This is not an adult doujinshi."}\n\n${entry.isStorefront?"<b>This is a storefront item. Be careful when ordering!</b>\n\n":""}<b>Link</b>: ${entry.link}`
                        bot.sendPhoto(user.id,entry.image,options);
                    });
                }).finally(() => {
                    user.is_performing_manual_search = false;
                });
            } else if(user.is_performing_manual_search) {
                bot.sendMessage(user_id,`I've found some items, but all of the items listed have been blacklisted.\n\nI only display items that have been added within 7 days, so make sure you check Mandarake anyways! https://order.mandarake.co.jp/`).then(function() {
                    user.is_performing_manual_search = false;
                });

            }
        } else if(user.is_performing_manual_search) {
            bot.sendMessage(user_id,`Sorry, I haven't found any recent additions!\n\nI only display items that have been added within 7 days, so make sure you check Mandarake anyways! https://order.mandarake.co.jp/}`).then(function() {
                user.is_performing_manual_search = false;
            });

        }

    })
}

function getPagination( current, maxpage ) {
      var keys = [];
      if (current>1) keys.push({ text: `«1`, callback_data: 'page1' });
      if (current>2) keys.push({ text: `‹${current-1}`, callback_data: "page"+(current-1).toString() });
      keys.push({ text: `- ${current} -`, callback_data: "page"+current.toString() });
      if (current<maxpage-1) keys.push({ text: `${current+1}›`, callback_data: "page"+(current+1).toString() })
      if (current<maxpage) keys.push({ text: `${maxpage}»`, callback_data: "page"+maxpage.toString() });

      return {
        reply_markup: JSON.stringify({
              inline_keyboard: [ keys ,[{text:"Blacklist item",callback_data:`blacklist ${current}`}]]
        })
      };
}

function saveUsersList() {
    try {
        fs.writeFile("./usersList.json", JSON.stringify(users), function(err) {
            if (err) {
                console.log(err);
            }
        });
    } catch (e) {
        console.log(e);
    }
}

function main() {
    for(id in users) {
        var user = users[id]
        user.is_performing_manual_search = false;
        searchBulk(id);
    }
}
setInterval(main,600000);

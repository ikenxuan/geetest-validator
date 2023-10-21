import fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import os from 'os'
import fs from 'fs'
import path from 'path'
import ejs from 'ejs'
import YAML from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url));
let cfg = YAML.parse(fs.readFileSync('./config.yaml', 'utf8'))

/** 开鸡！ */
const server = fastify();
server.listen({
    port: cfg.Port,
    host: cfg.Host,
    log: true
}, function (err, address) {
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }

    console.log(`Geetest手动验证服务器正在监听 ${address}\n\n# API接口:\n [GET/POST] http://${getLocalIP()}/geetest`)
})
server.register(fastifyStatic, {
    root: join(__dirname),
    prefix: '/'
});

server.get('/', (request, reply) => {
    let content = fs.readFileSync('html/index.html', 'utf8')
    reply
        .type('text/html')
        .send(content);

})
/** 验证地址 */
server.get('/geetest', (request, reply) => {
    //获取query参数
    const { gt, challenge, callback, e } = request.query
    const accept = request.headers.accept

    /** 读取html */
    let content = fs.readFileSync('html/index.html', 'utf8')

    /** 填入参数 */
    if (gt && !challenge) {
        reply
            .code(403)
            .send({
                retcode: 403,
                info: "传入参数不完整，缺少 challenge ",
                data: null
            });
    }
    if (challenge && !gt) {
        reply
            .code(403)
            .send({
                retcode: 403,
                info: "传入参数不完整，缺少 gt 。查询请把 challenge 值传入 callback 字段即可查询",
                data: null
            });
    }
    if (gt && challenge) {
        content = content.replace('id="gt"', `id="gt" value="${gt}"`)
        content = content.replace('id="challenge"', `id="challenge" value="${challenge}"`)

        /** 通过challenge参数保存文件 */
        const data = {
            "retcode": 204,
            "info": "服务器支持[GET/POST]请求，传入 gt 和 challenge 值即可还原验证码，把 challenge 值传入 callback 字段可进行结果查询",
        }
        const fileName = `${challenge}.json`
        const filePath = path.join(__dirname, 'data', fileName)
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
        if (accept === 'application/json') {
            reply
                .type('application/json')
                .send(fileName)
        } else {
            reply
                .type('text/html')
                .send(content)
        }

    }

    /** 回调地址 */
    if (callback) {
        const fileName = `${callback}.json`;
        const filePath = path.join(__dirname, 'data', fileName)

        try {
            const content = fs.readFileSync(filePath, 'utf8')
            reply
                .type('application/json')
                .send(content);

        } catch (err) {
            reply
                .type('application/json')
                .send({
                    retcode: 204,
                    info: '未生成对应文件，请等待用户访问验证地址',
                });
        }

    }

    /** 短链转发 */
    if (e) {
        const token = request.query.e
        const valid = verifyToken(token)
        if (valid) {
            // 读取HTML模板文件
            const template = fs.readFileSync('html/jump.ejs', 'utf8')
            // 使用EJS将targetUrl传递到HTML模板中
            const popupHTML = ejs.render(template, { targetUrl })

            reply
                .code(200)
                .type('text/html')
                .send(popupHTML)
        } else {
            // Token验证失败的响应
            const html = fs.readFileSync('html/old_token.html', 'utf8')
            reply
                .code(403)
                .type('text/html')
                .send(html)
        }

    }
    reply
        .type('text/html')
        .send(content)

});

let targetUrl
server.post('/geetest', (request, reply) => {
    const { gt, challenge, url } = request.body

    /** 返回短链token */
    if (url && !(gt, challenge)) {

        targetUrl = url
        const token = getRandomString(4)
        reply
            .send({
                status: 0,
                message: "OK",
                data: {
                    token
                }
            })
    }

    /** 返回 `验证地址短链` 和 `回调` */
    if (gt && challenge && !url) {
        let link = `http://${getLocalIP()}/geetest`
        targetUrl = `${link}?gt=${gt}&challenge=${challenge}`
        const token = getRandomString(4)
        /** 通过challenge参数保存文件 */
        const resultdata = {
            status: 0,
            message: "OK",
            data: {
                link: `${link}?e=${token}`,
                result: `${link}?callback=${challenge}`
            }
        }
        reply
            .type('application/json')
            .send(resultdata)
    }
})
// 接收 challenge 和 seccode 参数
// 读取文件 - 更新数据 - 写入文件
server.post('/updateResult', (req, res) => {
    const { gt, challenge, validate, seccode } = req.body

    // 读取原文件
    const filePath = `./data/${challenge}.json`
    let data = fs.readFileSync(filePath, 'utf8')
    data = JSON.parse(data)

    // 初始化data
    if(!data.data) {
        data.data = {}
    }
    // 更新数据
    data.retcode = 200
    data.data.geetest_gt = gt
    data.data.geetest_challenge = challenge
    data.data.geetest_validate = validate
    data.data.geetest_seccode = seccode


    // 保存文件
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
})

const tokenMap = {}
function getRandomString(len) {
    let _charStr = 'abacdefghjklmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789',
        min = 0,
        max = _charStr.length - 1,
        _str = '' //定义随机字符串 变量
    //判断是否指定长度，否则默认长度为15
    len = len || 15
    //循环生成字符串
    for (var i = 0, index; i < len; i++) {
        index = (function (randomIndexFunc, i) {
            return randomIndexFunc(min, max, i, randomIndexFunc)
        })(function (min, max, i, _self) {
            let indexTemp = Math.floor(Math.random() * (max - min + 1) + min),
                numStart = _charStr.length - 10;
            if (i == 0 && indexTemp >= numStart) {
                indexTemp = _self(min, max, i, _self)
            }
            return indexTemp
        }, i)
        _str += _charStr[index]
    }
    tokenMap[_str] = {
        createTime: Date.now()
    }

    return _str
}

/** 验证token有效性 */
function verifyToken(token) {
    const now = Date.now()
    const tokenData = tokenMap[token]

    if (!tokenData || now - tokenData.createTime > 240 * 1000) {
        return false; //不存在则无效
    }

    return true; //有效
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
  
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address + ':' + cfg.Port;
        }
      }
    }
  }
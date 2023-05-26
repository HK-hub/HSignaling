const Conversation = require('./public/js/Client')
// server.js
const WebSocket = require('ws')

const wss = new WebSocket.Server({ port: 5000 })

// 信令
const SIGNALING_TYPE = "signaling-event";

// 主动加入房间
const SIGNALING_TYPE_JOIN = "join-event";

// 告知加入者对方是谁
const SIGNALING_TYPE_RESP_JOIN = "join-resp-event";

// 主动离开房间
const SIGNALING_TYPE_LEAVE = "leave-event";

// 有人加入房间，通知已经在房间内的人
const SIGNALING_TYPE_NEW_PEER = "new-peer-event";

// 有人离开房间，通知房间内的人
const SIGNALING_TYPE_PEER_LEAVE = "leave-peer-event";

// offer：发送offer给对端peer
const SIGNALING_TYPE_OFFER = "offer-event";

// answer： 发送offer给对端peer
const SIGNALING_TYPE_ANSWER = "answer-event";

// 发送candidate给对端peer
const SIGNALING_TYPE_CANDIDATE = "candidate-event";

// 房间-用户-ws 管理表: key:roomId, value:Set<Client>
let roomTableMap = new Map();

//如果有WebSocket请求接入，wss对象可以响应connection事件来处理这个WebSocket：
wss.on('connection', ws => { //在connection事件中，回调函数会传入一个WebSocket的实例，表示这个WebSocket连接。
    // 绑定事件
    ws.on('message', message => {
        // console.log(`Received message => ${message}`)
        onMessageEvent(JSON.parse(message), ws)
    })
    // 关闭
    ws.on("close", ev => {
        console.log('连接关闭：', ev)
    })
    // 错误
    ws.on("error", err => {
        console.log('监听到错误：', err)
    })
    ws.send('Hello! Message From Server!!')
})

// 当收到消息
const onMessageEvent = (message, ws) => {
    switch (message.cmd) {
        case SIGNALING_TYPE_JOIN:
            handleJoinRoom(message,ws)
            break;
        case SIGNALING_TYPE_LEAVE:
            handleLeaveRoom(message, ws)
            break;
        case SIGNALING_TYPE_OFFER:
            handleOffer(message,ws)
            break;
        case SIGNALING_TYPE_ANSWER:
            handleAnswer(message,ws)
            break;
        case SIGNALING_TYPE_CANDIDATE:
            handleCandidate(message,ws)
            break;
    }
}

// 加入房间
const handleJoinRoom = (message, ws) => {
    console.log('用户：' + message.uid + ', 加入房间:' + message.roomId + ', 连接号：'+ ws)

    // 查看房间是否存在
    let roomMap = roomTableMap.get(message.roomId)
    if (roomMap == null) {
        // 房间不存在
        roomMap = new Map()
        roomTableMap.set(message.roomId, roomMap);
    }

    // 判断房间类型，房间人数上限
    if (roomMap.size > 2) {
        console.error('roomId:' + message.roomId + ', 已经有两人存在，请使用其他房间!')
        // TODO 房间人数已满, 响应给客户端
        ws.send(JSON.stringify({
            cmd: 'SIGNALING_TYPE_MEMBER_FULL',
            roomId: message.roomId,
            message: '房间已经有两人存在，请使用其他房间!'
        }))
        return ;
    }

    let client = new Conversation.Client(message.uid, message.roomId, ws)
    roomMap.set(message.uid, client)

    // 有人进来了
    if (roomMap.size > 1) {
        // 房间已经有人了，加上新进来的人，那就是>=2了，所以要通知对方
        let clients = roomMap.entries();
        for ([key, value] of clients) {
            const remoteUid = key
            // 排除自己
            if (remoteUid != message.uid) {
                let jsonMsg = {
                    cmd: SIGNALING_TYPE_NEW_PEER,
                    remoteUid: message.uid,
                }
                let remoteClient = value
                // 通知对方
                let msg = JSON.stringify(jsonMsg);
                console.info('new-peer: ', msg)
                remoteClient.ws.send(msg)

                // 通知自己
                jsonMsg = {
                    cmd: SIGNALING_TYPE_RESP_JOIN,
                    remoteUid: remoteUid,
                }
                msg = JSON.stringify(jsonMsg)
                console.info('resp-peer: ' , msg)
                ws.send(msg)
            }
        }
    }
}

// 离开房间
const handleLeaveRoom = (message, ws) => {
    const roomId = message.roomId
    const uid = message.uid

    console.info('uid:' + uid + ', try to leave room:' + roomId)
    // 获取房间
    let roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        // 不能找到房间
        console.error('handle leave room: can not find room:', roomId)
        return;
    }

    // 离开房间：删除用户
    roomMap.delete(uid)

    // 发送给房间的其他人：
    if (roomMap.size >= 1) {
        let clients = roomMap.entries();
        for ([key, value] of clients) {
            const remoteUid = key
            const client = value;
            // 离开房间消息：
            const jsonMsg = {
                cmd: SIGNALING_TYPE_PEER_LEAVE,
                // 谁离开了
                remoteUid: remoteUid,
                roomId: roomId
            }
            // 获取客户端
            if (client != null) {
                // 发送有人离开了
                console.info('notify peer:' + client.uid + ' , uid=' + uid + ' leave room:' + roomId)
                client.ws.send(JSON.stringify(jsonMsg))
            }
        }
    }

}

// 处理 offer
const handleOffer = (message, ws) => {
    const roomId = message.roomId
    const uid = message.uid
    const remoteUid = message.remoteUid
    console.info('handleOffer uid:' + uid + ", transfer offer ro remoteUid:" + remoteUid)

    const roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error('handleOffer error: can not find room: ', roomId)
        return;
    }

    // 房间存在，看该成员是否存在
    if (roomMap.get(uid) == null) {
        console.error('handleOffer error: can not find user: ', uid)
        return;
    }

    // 查询remoteUid 客户端
    const remoteClient = roomMap.get(remoteUid);
    if (remoteClient) {
        const msg = JSON.stringify(message)
        remoteClient.ws.send(msg)
    } else {
        console.error('handleOffer error: can not find user: ', uid)
    }
}
// 处理 answer
const handleAnswer = (message, ws) => {
    const roomId = message.roomId
    const uid = message.uid
    const remoteUid = message.remoteUid
    console.info('handleAnswer uid:' + uid + ", transfer Answer ro remoteUid:" + remoteUid)

    const roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error('handleAnswer error: can not find room: ', roomId)
        return;
    }

    // 房间存在，看该成员是否存在
    if (roomMap.get(uid) == null) {
        console.error('handleAnswer error: can not find user: ', uid)
        return;
    }

    // 查询remoteUid 客户端
    const remoteClient = roomMap.get(remoteUid);
    if (remoteClient) {
        const msg = JSON.stringify(message)
        remoteClient.ws.send(msg)
    } else {
        console.error('handleAnswer error: can not find user: ', uid)
    }
}
// 处理 candidate
const handleCandidate = (message, ws) => {
    const roomId = message.roomId
    const uid = message.uid
    const remoteUid = message.remoteUid
    console.info('handleCandidate uid:' + uid + ", transfer Candidate to remoteUid:" + remoteUid)

    const roomMap = roomTableMap.get(roomId);
    if (roomMap == null) {
        console.error('handleCandidate error: can not find room: ', roomId)
        return;
    }

    // 房间存在，看该成员是否存在
    if (roomMap.get(uid) == null) {
        console.error('handleCandidate error: can not find user: ', uid)
        return;
    }

    // 查询remoteUid 客户端
    const remoteClient = roomMap.get(remoteUid);
    if (remoteClient) {
        const msg = JSON.stringify(message)
        remoteClient.ws.send(msg)
    } else {
        console.error('handleOCandidate error: can not find user: ', uid)
    }
}




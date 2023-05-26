class Client {

    // 用户id
    uid
    // 房间号
    roomId
    // ws 连接
    ws

    constructor(uid, roomId, ws) {
        this.uid = uid
        this.roomId = roomId
        this.ws = ws;
    }
}

module.exports = {
    Client
}
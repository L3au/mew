/**
 * Created by Leshu on 4/27/15.
 */
var stream = require('stream');
var Readable = stream.Readable;
var util = require("util");

// 原型构造方法继承
util.inherits(ObjectStream, Readable);

function ObjectStream(opt) {
    Readable.call(this, opt);// 调用父类构造方法
}

// _read方法是read方法的底层实现
ObjectStream.prototype._read = function () {
    this.push("hello 雨林博客");
};

var con = new ObjectStream();
var info = con.read();//读取流中的数据，这
console.log("流中的数据：%s", info);

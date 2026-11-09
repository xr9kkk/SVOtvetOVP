const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Detector} = require('./detector.js');
const make = () => new Detector({ownName:'Я',answers:['+','-','Здравствуйте'],threshold:2,windowMs:30000,cooldownMs:120000});
test('any text mode works without an allowlist and copies latest matching text',()=>{
 const d=make(); d.config.anyText=true; d.config.answers=[];
 assert.equal(d.add({id:'1',author:'Я',text:'До свидания'},0),undefined);
 assert.equal(d.add({id:'2',author:'А',text:'До свидания'},1),undefined);
 assert.equal(d.add({id:'3',author:'А',text:'До свидания'},2),undefined);
 assert.equal(d.add({id:'4',author:'Б',text:'ДО СВИДАНИЯ!'},3).answer,'ДО СВИДАНИЯ!');
});
test('list mode still ignores unknown text; punctuation-only messages stay distinct',()=>{
 const d=make();
 d.add({id:'1',author:'А',text:'не в списке'},0);
 assert.equal(d.add({id:'2',author:'Б',text:'не в списке'},1),undefined);
 d.config.anyText=true;
 d.add({id:'3',author:'А',text:'?'},2);
 assert.equal(d.add({id:'4',author:'Б',text:'!'},3),undefined);
 assert.equal(d.add({id:'5',author:'Б',text:'?'},4).answer,'?');
});
test('counts distinct authors and excludes own messages and duplicate IDs',()=>{
 const d=make();
 assert.equal(d.add({id:'1',author:'Я',text:'+'},0),undefined);
 assert.equal(d.add({id:'2',author:'А',text:'+'},1),undefined);
 assert.equal(d.add({id:'3',author:'А',text:'+'},2),undefined);
 assert.equal(d.add({id:'2',author:'Б',text:'+'},3),undefined);
 assert.equal(d.add({id:'4',author:'Б',text:'+'},4).answer,'+');
});
test('normalization, exact allowlist and rolling window',()=>{
 const d=make();
 d.add({id:'1',author:'А',text:'Здравствуйте!'},0);
 assert.equal(d.add({id:'2',author:'Б',text:'здравствуйте'},31000),undefined);
 assert.equal(d.add({id:'3',author:'В',text:'ну здравствуйте'},32000),undefined);
 assert.equal(d.add({id:'4',author:'В',text:'ЗДРАВСТВУЙТЕ.'},33000).answer,'Здравствуйте');
});
test('cooldown and reset require fresh votes',()=>{
 const d=make();
 d.add({id:'1',author:'А',text:'−'},0);
 const c=d.add({id:'2',author:'Б',text:'-'},1);
 d.consume(c,1);
 assert.equal(d.add({id:'3',author:'В',text:'+'},2),undefined);
 assert.equal(d.add({id:'4',author:'Г',text:'+'},3),undefined);
 assert.equal(d.add({id:'5',author:'А',text:'-'},120002),undefined);
 assert.equal(d.add({id:'6',author:'Б',text:'-'},120003).answer,'-');
});

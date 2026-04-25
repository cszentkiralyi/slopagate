class SetterTest {
  #v
  v;
  get v() { return this.#v; }
  set v(v) { console.log('SetterTest setter!'); this.#v = v; }
}

class SetterTestSub extends SetterTest {}

let s = new SetterTestSub();
s.v = 'foo';
JAVAC = javac
JAVA = java
FLAGS = --release 17
OUT = out
SRCS = Main.java src/App.java src/Utils.java

.PHONY: all clean run

all: $(OUT)
	$(JAVAC) $(FLAGS) -d $(OUT) $(SRCS)

$(OUT):
	mkdir -p $(OUT)

run: all
	$(JAVA) -cp $(OUT) Main

clean:
	rm -rf $(OUT)

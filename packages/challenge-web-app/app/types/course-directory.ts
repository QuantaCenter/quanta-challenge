export interface DirectorySection {
   id: string;
   title: string;
   type: 'article' | 'problem';
   completed?: boolean;
   unlocked?: boolean;
}

export interface DirectoryChapter {
   id: string;
   title: string;
   unlocked?: boolean;
   sections: DirectorySection[];
}
